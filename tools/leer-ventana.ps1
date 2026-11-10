param([long]$Ventana, [int]$X = 0, [int]$Y = 0)
# Captura bajo petición: no enumera otras ventanas ni lee el portapapeles.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,WindowsBase
Add-Type -ReferencedAssemblies UIAutomationClient,UIAutomationTypes,WindowsBase -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Automation;
public static class TextoVentanaApolo {
  public static string[] Leer(long hwnd, int x, int y) {
    var raiz=AutomationElement.FromHandle(new IntPtr(hwnd));
    if(raiz==null)throw new Exception("La ventana pulsada ya no existe");
    var candidatos=new List<AutomationElement>();candidatos.Add(raiz);
    foreach(AutomationElement el in raiz.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.IsTextPatternAvailableProperty,true))) candidatos.Add(el);
    string mejor="",fuente="texto visible";double puntuacion=-1;
    foreach(var el in candidatos) {
      try {
        if(el.Current.IsPassword||el.Current.IsOffscreen)continue;
        var tipo=el.Current.ControlType;
        if(tipo!=ControlType.Document&&tipo!=ControlType.Edit)continue;
        var rect=el.Current.BoundingRectangle;
        if(rect.Width<80||rect.Height<35)continue;
        object objeto;if(!el.TryGetCurrentPattern(TextPattern.Pattern,out objeto))continue;
        var patron=(TextPattern)objeto;var sb=new StringBuilder();bool seleccion=false;
        try { foreach(var r in patron.GetSelection()){var t=r.GetText(60000);if(!String.IsNullOrWhiteSpace(t))sb.AppendLine(t);} seleccion=sb.Length>0; } catch {}
        if(sb.Length==0)foreach(var r in patron.GetVisibleRanges()) { sb.AppendLine(r.GetText(Math.Max(0,60000-sb.Length)));if(sb.Length>=60000)break; }
        var texto=sb.ToString().Trim();if(texto.Length==0)continue;
        double p=(rect.Contains(new Point(x,y))?100000:0)+(seleccion?50000:0)+(tipo==ControlType.Document?10000:0)+Math.Min(texto.Length,20000);
        if(p>puntuacion){mejor=texto;fuente=seleccion?"selección de la ventana":"texto visible de la ventana";puntuacion=p;}
      } catch(ElementNotAvailableException) {} catch(InvalidOperationException) {}
    }
    return new string[]{mejor,fuente};
  }
}
"@
try {
  $captura = [TextoVentanaApolo]::Leer($Ventana,$X,$Y)
  @{ texto=$captura[0]; fuente=$captura[1]; completo=$false } | ConvertTo-Json -Compress
} catch { @{error=$_.Exception.Message} | ConvertTo-Json -Compress }
