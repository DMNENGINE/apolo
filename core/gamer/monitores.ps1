# Modo Gamer (SOLO LECTURA): frecuencia actual y maxima de cada monitor con EnumDisplaySettings.
# Max = la mayor frecuencia que el driver ofrece A LA RESOLUCION ACTUAL. Salida: JSON [{nombre, ancho, alto, actualHz, maxHz, principal}]
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class ApoloMon {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DISPLAY_DEVICE {
    public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString; public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplayDevices(string dev, int i, ref DISPLAY_DEVICE dd, int flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  public static List<object[]> Leer() {
    var r = new List<object[]>();
    for (int i = 0; ; i++) {
      var dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(dd);
      if (!EnumDisplayDevices(null, i, ref dd, 0)) break;
      if ((dd.StateFlags & 1) == 0) continue;
      var cur = new DEVMODE(); cur.dmSize = (short)Marshal.SizeOf(cur);
      if (!EnumDisplaySettings(dd.DeviceName, -1, ref cur)) continue;
      int max = cur.dmDisplayFrequency;
      for (int m = 0; ; m++) {
        var dm = new DEVMODE(); dm.dmSize = (short)Marshal.SizeOf(dm);
        if (!EnumDisplaySettings(dd.DeviceName, m, ref dm)) break;
        if (dm.dmPelsWidth == cur.dmPelsWidth && dm.dmPelsHeight == cur.dmPelsHeight && dm.dmDisplayFrequency > max) max = dm.dmDisplayFrequency;
      }
      var mon = new DISPLAY_DEVICE(); mon.cb = Marshal.SizeOf(mon);
      string nombre = EnumDisplayDevices(dd.DeviceName, 0, ref mon, 0) ? mon.DeviceString : dd.DeviceString;
      r.Add(new object[] { nombre, cur.dmPelsWidth, cur.dmPelsHeight, cur.dmDisplayFrequency, max, (dd.StateFlags & 4) != 0 });
    }
    return r;
  }
}
"@
$out = @(foreach ($m in [ApoloMon]::Leer()) { [pscustomobject]@{ nombre = $m[0]; ancho = $m[1]; alto = $m[2]; actualHz = $m[3]; maxHz = $m[4]; principal = $m[5] } })
ConvertTo-Json -InputObject $out -Compress
