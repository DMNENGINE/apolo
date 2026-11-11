param([long]$Ventana,[int]$X=0,[int]$Y=0)
# Sin portapapeles, teclas simuladas, perfiles ni enumeración de otras ventanas.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,WindowsBase,System.Drawing
Add-Type -ReferencedAssemblies UIAutomationClient,UIAutomationTypes,WindowsBase,System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Automation;
public class ContextoSnapApolo {
  [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct PUNTO {public int X,Y;public PUNTO(int x,int y){X=x;Y=y;}}
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(PUNTO p);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int n);
  public string url="",imagenUrl="",captura="",tipoCaptura="ventana",aviso="";
  public int ancho,alto;
  static string Url(string s) {
    if(String.IsNullOrWhiteSpace(s))return "";s=s.Trim();Uri u;
    if(!s.Contains("://")&&System.Text.RegularExpressions.Regex.IsMatch(s,@"^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(/|$)"))s="https://"+s;
    return Uri.TryCreate(s,UriKind.Absolute,out u)&&(u.Scheme=="http"||u.Scheme=="https")&&String.IsNullOrEmpty(u.UserInfo)?u.AbsoluteUri:"";
  }
  static string ValorUrl(AutomationElement el) {
    object p;
    try {if(el.Current.IsPassword)return "";if(el.TryGetCurrentPattern(ValuePattern.Pattern,out p)){var u=Url(((ValuePattern)p).Current.Value);if(u!="")return u;}}catch{}
    try {var propiedad=AutomationProperty.LookupById(30093);if(propiedad!=null)return Url(el.GetCurrentPropertyValue(propiedad,true) as string);}catch{}
    return "";
  }
  static bool EsBarra(AutomationElement el,AutomationElement raiz) {
    var c=el.Current;bool barra=false;
    var p=el;for(int i=0;i<20;i++){p=TreeWalker.ControlViewWalker.GetParent(p);if(p==null||p.Equals(raiz))break;if(p.Current.ControlType==ControlType.Document)return false;if(p.Current.ControlType==ControlType.ToolBar)barra=true;}
    return barra||System.Text.RegularExpressions.Regex.IsMatch(c.AutomationId+" "+c.Name,@"(?i)urlbar|omnibox|address|location|direcci[oó]n|ubicaci[oó]n");
  }
  Rectangle Accesible(IntPtr h,int x,int y,RECT wr) {
    var r=this;var recorte=new Rectangle(0,0,wr.Right-wr.Left,wr.Bottom-wr.Top);
    try {
      var raiz=AutomationElement.FromHandle(h);var punto=new System.Windows.Point(x,y);double mejor=-1;
      var filtro=new OrCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Document),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.ComboBox));
      foreach(AutomationElement el in raiz.FindAll(TreeScope.Descendants,filtro)) {
        try {
          var c=el.Current;if(c.IsPassword)continue;
          var documento=c.ControlType==ControlType.Document;
          if(documento&&c.IsOffscreen)continue;
          if(!documento&&!EsBarra(el,raiz))continue;
          var u=ValorUrl(el);if(u=="")continue;
          double p=documento?(c.BoundingRectangle.Contains(punto)?200:50):100;
          if(p>mejor){mejor=p;r.url=u;}
        }catch{}
      }
      // Buscar la imagen dentro de ESA ventana; no usar FromPoint sobre otra aplicación.
      foreach(AutomationElement el in raiz.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Image))) {
        try {
          var c=el.Current;var b=c.BoundingRectangle;
          if(c.IsOffscreen||!b.Contains(punto)||b.Width<12||b.Height<12)continue;
          var zona=Rectangle.Intersect(recorte,new Rectangle((int)b.X-wr.Left,(int)b.Y-wr.Top,(int)Math.Ceiling(b.Width),(int)Math.Ceiling(b.Height)));
          if(zona.Width<12||zona.Height<12)continue;
          if(r.tipoCaptura!="imagen"||zona.Width*zona.Height<recorte.Width*recorte.Height){recorte=zona;r.tipoCaptura="imagen";r.imagenUrl=ValorUrl(el);}
        }catch{}
      }
    }catch {r.aviso="La aplicación no expone su dirección; puedes guardar un recorte visible.";}
    return recorte;
  }
  public static ContextoSnapApolo Leer(long hwnd,int x,int y) {
    SetProcessDPIAware();var h=new IntPtr(hwnd);if(!IsWindow(h))throw new Exception("La ventana del clic ya no existe");
    RECT wr;if(!GetWindowRect(h,out wr)||wr.Right<=wr.Left||wr.Bottom<=wr.Top)throw new Exception("No se puede capturar esta ventana");
    var r=new ContextoSnapApolo();var recorte=new Rectangle(0,0,wr.Right-wr.Left,wr.Bottom-wr.Top);
    var accesible=new ContextoSnapApolo();var zona=recorte;
    var hilo=new System.Threading.Thread(()=>{zona=accesible.Accesible(h,x,y,wr);});hilo.IsBackground=true;hilo.Start();
    if(hilo.Join(3000)){r=accesible;recorte=zona;}else r.aviso="La dirección no respondió; puedes guardar una imagen de la ventana.";
    // PrintWindow captura la ventana indicada aunque el menú esté encima.
    int w=wr.Right-wr.Left,hh=wr.Bottom-wr.Top;
    if(w>10000||hh>10000)throw new Exception("La ventana es demasiado grande para capturarla");
    using(var original=new Bitmap(w,hh)) {
      // Si la zona está visible y pertenece a esta ventana, copiar sus píxeles
      // evita los cuadros negros de los navegadores que dibujan con GPU.
      var pantalla=new Rectangle(GetSystemMetrics(76),GetSystemMetrics(77),GetSystemMetrics(78),GetSystemMetrics(79));
      var absoluta=new Rectangle(wr.Left+recorte.X,wr.Top+recorte.Y,recorte.Width,recorte.Height);
      var visible=Rectangle.Intersect(absoluta,pantalla);bool descubierta=visible.Width>20&&visible.Height>20;
      if(descubierta){
        for(int py=visible.Top+10;py<visible.Bottom-8&&descubierta;py+=48)
          for(int px=visible.Left+10;px<visible.Right-8;px+=48)
            if(GetAncestor(WindowFromPoint(new PUNTO(px,py)),2)!=h){descubierta=false;break;}
      }
      bool ok=false;
      if(descubierta)try {using(var g=Graphics.FromImage(original))g.CopyFromScreen(visible.Location,new Point(visible.X-wr.Left,visible.Y-wr.Top),visible.Size,CopyPixelOperation.SourceCopy);ok=true;}catch{}
      if(!ok)using(var g=Graphics.FromImage(original)){var dc=g.GetHdc();try{ok=PrintWindow(h,dc,2);}finally{g.ReleaseHdc(dc);}}
      if(!ok){r.aviso="Windows no permitió copiar esta ventana.";return r;}
      double escala=Math.Min(1.0,2000.0/Math.Max(recorte.Width,recorte.Height));
      r.ancho=Math.Max(1,(int)(recorte.Width*escala));r.alto=Math.Max(1,(int)(recorte.Height*escala));
      using(var imagen=new Bitmap(r.ancho,r.alto))using(var g=Graphics.FromImage(imagen))using(var salida=new MemoryStream()){
        g.DrawImage(original,new Rectangle(0,0,r.ancho,r.alto),recorte,GraphicsUnit.Pixel);imagen.Save(salida,ImageFormat.Png);r.captura=Convert.ToBase64String(salida.ToArray());
      }
    }
    return r;
  }
}
"@
try {[ContextoSnapApolo]::Leer($Ventana,$X,$Y)|ConvertTo-Json -Compress} catch {@{error=$_.Exception.Message}|ConvertTo-Json -Compress}
