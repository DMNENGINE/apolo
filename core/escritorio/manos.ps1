# Manos del robot (Windows, sin dependencias): proceso persistente que lee órdenes JSON por stdin (una por línea)
# y contesta JSON por stdout. C# compilado una vez → cada acción tarda milisegundos.
#   {"id":1,"op":"info","x":..,"y":..}      ventana activa, elemento con foco y elemento en ese punto
#   {"id":2,"op":"mover|clic|arrastrar|scroll|escribir|tecla", ...}   (coordenadas de PANTALLA reales)
#   {"id":3,"op":"armar"} / {"op":"desarmar"}  vigilante: si el usuario mueve el ratón, hace clic o pulsa una tecla
#                                              (o Ctrl+Alt+Esc), emite {"evento":"panico","motivo":..} y se desarma
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase
Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase, System.Web.Extensions -TypeDefinition @'
using System; using System.Text; using System.Threading; using System.Collections.Generic;
using System.Runtime.InteropServices; using System.Web.Script.Serialization; using System.Windows.Automation;

public static class Manos {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern short VkKeyScan(char c);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] i, int size);

  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }

  const uint M_LDOWN = 0x2, M_LUP = 0x4, M_RDOWN = 0x8, M_RUP = 0x10, M_MDOWN = 0x20, M_MUP = 0x40, M_WHEEL = 0x800;
  const uint K_UP = 0x2, K_UNICODE = 0x4, K_EXT = 0x1;

  static readonly object salida = new object();
  static readonly JavaScriptSerializer js = new JavaScriptSerializer();
  static volatile bool armado = false, ocupado = false;
  static long graciaHasta = 0;
  static int espX, espY;

  static void Escribir(object o) { lock (salida) { Console.Out.WriteLine(js.Serialize(o)); Console.Out.Flush(); } }
  static long Ahora() { return DateTime.UtcNow.Ticks / 10000; }

  static void Mouse(uint flags, uint data = 0) {
    var i = new INPUT[1]; i[0].type = 0; i[0].u.mi.dwFlags = flags; i[0].u.mi.mouseData = data;
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
  static void Tecla(ushort vk, bool arriba) {
    var i = new INPUT[1]; i[0].type = 1; i[0].u.ki.wVk = vk;
    i[0].u.ki.dwFlags = (arriba ? K_UP : 0) | (EsExtendida(vk) ? K_EXT : 0);
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
  static bool EsExtendida(ushort vk) { return (vk >= 0x21 && vk <= 0x2E) || vk == 0x5B || vk == 0x5C; }
  static void Unicode(char c) {
    var i = new INPUT[2];
    for (int k = 0; k < 2; k++) { i[k].type = 1; i[k].u.ki.wScan = c; i[k].u.ki.dwFlags = K_UNICODE | (k == 1 ? K_UP : 0); }
    SendInput(2, i, Marshal.SizeOf(typeof(INPUT)));
  }
  static void Mover(int x, int y) { espX = x; espY = y; SetCursorPos(x, y); }

  static readonly Dictionary<string, ushort> VK = new Dictionary<string, ushort> {
    {"ctrl",0x11},{"control",0x11},{"alt",0x12},{"shift",0x10},{"mayus",0x10},{"win",0x5B},{"enter",0x0D},{"intro",0x0D},{"esc",0x1B},{"escape",0x1B},
    {"tab",0x09},{"backspace",0x08},{"retroceso",0x08},{"delete",0x2E},{"supr",0x2E},{"insert",0x2D},{"space",0x20},{"espacio",0x20},
    {"up",0x26},{"arriba",0x26},{"down",0x28},{"abajo",0x28},{"left",0x25},{"izquierda",0x25},{"right",0x27},{"derecha",0x27},
    {"home",0x24},{"inicio",0x24},{"end",0x23},{"fin",0x23},{"pageup",0x21},{"repag",0x21},{"pagedown",0x22},{"avpag",0x22},
    {"capslock",0x14},{"printscreen",0x2C},{"menu",0x5D}
  };
  static ushort CodigoTecla(string n) {
    n = n.Trim().ToLowerInvariant();
    ushort v; if (VK.TryGetValue(n, out v)) return v;
    if (n.Length > 1 && n[0] == 'f') { int f; if (int.TryParse(n.Substring(1), out f) && f >= 1 && f <= 24) return (ushort)(0x70 + f - 1); }
    if (n.Length == 1) { short s = VkKeyScan(n[0]); if (s != -1) return (ushort)(s & 0xFF); }
    throw new Exception("tecla desconocida: " + n);
  }

  // ---------- información para las comprobaciones de seguridad ----------
  static Dictionary<string, object> Elem(AutomationElement e) {
    if (e == null) return null;
    try {
      var c = e.Current;
      return new Dictionary<string, object> { {"tipo", c.ControlType.ProgrammaticName.Replace("ControlType.", "")}, {"nombre", c.Name ?? ""}, {"password", c.IsPassword} };
    } catch { return null; }
  }
  static Dictionary<string, object> Info(Dictionary<string, object> o) {
    var h = GetForegroundWindow(); var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
    uint pid; GetWindowThreadProcessId(h, out pid);
    string proc = ""; try { proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    POINT p; GetCursorPos(out p);
    var r = new Dictionary<string, object> { {"ventana", new Dictionary<string, object> { {"titulo", sb.ToString()}, {"proceso", proc} }}, {"cursor", new int[] { p.X, p.Y }} };
    try { r["foco"] = Elem(AutomationElement.FocusedElement); } catch { }
    if (o.ContainsKey("x") && o.ContainsKey("y")) {
      try { r["enPunto"] = Elem(AutomationElement.FromPoint(new System.Windows.Point(Convert.ToDouble(o["x"]), Convert.ToDouble(o["y"])))); } catch { }
    }
    return r;
  }

  // ---------- acciones ----------
  static void Hacer(Dictionary<string, object> o) {
    string op = (string)o["op"];
    Func<string, int> I = k => Convert.ToInt32(o[k]);
    switch (op) {
      case "mover": Mover(I("x"), I("y")); break;
      case "clic": {
        Mover(I("x"), I("y")); Thread.Sleep(40);
        string b = o.ContainsKey("boton") ? (string)o["boton"] : "izq";
        uint d = b == "der" ? M_RDOWN : b == "medio" ? M_MDOWN : M_LDOWN, u = b == "der" ? M_RUP : b == "medio" ? M_MUP : M_LUP;
        int veces = o.ContainsKey("doble") && Convert.ToBoolean(o["doble"]) ? 2 : 1;
        for (int k = 0; k < veces; k++) { Mouse(d); Thread.Sleep(25); Mouse(u); Thread.Sleep(60); }
        break;
      }
      case "arrastrar": {
        Mover(I("x"), I("y")); Thread.Sleep(50); Mouse(M_LDOWN); Thread.Sleep(80);
        int x2 = I("x2"), y2 = I("y2"), x1 = I("x"), y1 = I("y");
        for (int k = 1; k <= 12; k++) { Mover(x1 + (x2 - x1) * k / 12, y1 + (y2 - y1) * k / 12); Thread.Sleep(20); }
        Thread.Sleep(60); Mouse(M_LUP); break;
      }
      case "scroll": {
        if (o.ContainsKey("x")) { Mover(I("x"), I("y")); Thread.Sleep(30); }
        int n = I("cantidad");
        for (int k = 0; k < Math.Abs(n); k++) { Mouse(M_WHEEL, unchecked((uint)(n > 0 ? -120 : 120))); Thread.Sleep(30); }
        break;
      }
      case "escribir": {
        foreach (char c in (string)o["texto"]) {
          if (c == '\n') { Tecla(0x0D, false); Tecla(0x0D, true); }
          else if (c == '\t') { Tecla(0x09, false); Tecla(0x09, true); }
          else if (c != '\r') Unicode(c);
          Thread.Sleep(8);
        }
        break;
      }
      case "tecla": {
        var partes = ((string)o["combo"]).Split('+');
        var vks = new List<ushort>(); foreach (var p in partes) vks.Add(CodigoTecla(p));
        foreach (var v in vks) { Tecla(v, false); Thread.Sleep(15); }
        for (int k = vks.Count - 1; k >= 0; k--) { Tecla(vks[k], true); Thread.Sleep(15); }
        break;
      }
      default: throw new Exception("orden desconocida: " + op);
    }
  }

  // ---------- vigilante: el usuario recupera el control ----------
  static void Vigilar() {
    while (true) {
      Thread.Sleep(40);
      if (!armado || ocupado || Ahora() < graciaHasta) continue;
      string motivo = null;
      POINT p; GetCursorPos(out p);
      if ((GetAsyncKeyState(0x11) & 0x8000) != 0 && (GetAsyncKeyState(0x12) & 0x8000) != 0 && (GetAsyncKeyState(0x1B) & 0x8000) != 0) motivo = "teclas";
      else if (Math.Abs(p.X - espX) > 4 || Math.Abs(p.Y - espY) > 4) motivo = "raton";
      else if ((GetAsyncKeyState(0x01) & 0x8000) != 0 || (GetAsyncKeyState(0x02) & 0x8000) != 0) motivo = "clic";
      else for (int vk = 0x08; vk <= 0xFE; vk++) {
        if (vk >= 0x01 && vk <= 0x06) continue;
        if ((GetAsyncKeyState(vk) & 0x8000) != 0) { motivo = "teclado"; break; }
      }
      if (motivo != null) { armado = false; Escribir(new Dictionary<string, object> { {"evento", "panico"}, {"motivo", motivo} }); }
    }
  }

  public static void Run() {
    SetProcessDPIAware();
    var t = new Thread(Vigilar); t.IsBackground = true; t.Start();
    Escribir(new Dictionary<string, object> { {"evento", "listo"} });
    string linea;
    while ((linea = Console.In.ReadLine()) != null) {
      if (linea.Trim().Length == 0) continue;
      object id = null;
      try {
        var o = js.Deserialize<Dictionary<string, object>>(linea);
        id = o.ContainsKey("id") ? o["id"] : null;
        string op = (string)o["op"];
        Dictionary<string, object> r;
        if (op == "info") r = Info(o);
        else if (op == "armar") { POINT p; GetCursorPos(out p); espX = p.X; espY = p.Y; graciaHasta = Ahora() + 300; armado = true; r = new Dictionary<string, object>(); }
        else if (op == "desarmar") { armado = false; r = new Dictionary<string, object>(); }
        else {
          if (o.ContainsKey("armadoRequerido") && Convert.ToBoolean(o["armadoRequerido"]) && !armado) throw new Exception("el control está desactivado");
          ocupado = true;
          try { Hacer(o); } finally { POINT p; GetCursorPos(out p); espX = p.X; espY = p.Y; graciaHasta = Ahora() + 250; ocupado = false; }
          r = new Dictionary<string, object>();
        }
        r["id"] = id; r["ok"] = true; Escribir(r);
      } catch (Exception e) { Escribir(new Dictionary<string, object> { {"id", id}, {"ok", false}, {"error", e.Message} }); }
    }
  }
}
'@
[Manos]::Run()
