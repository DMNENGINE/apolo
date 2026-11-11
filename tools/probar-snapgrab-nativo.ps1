param([string]$Url)
# Ventana ficticia fuera de pantalla, sin activación ni barra de tareas.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
public class FormPruebaSnap : System.Windows.Forms.Form {
  protected override bool ShowWithoutActivation { get { return true; } }
}
"@
$formSnap=New-Object FormPruebaSnap
$formSnap.ShowInTaskbar=$false
$formSnap.StartPosition=[Windows.Forms.FormStartPosition]::Manual
$formSnap.Location=New-Object Drawing.Point(-25000,-25000)
$formSnap.Text='Prueba aislada SnapGrab'
$formSnap.Size=New-Object Drawing.Size(620,420)
$formSnap.BackColor=[Drawing.Color]::FromArgb(16,37,27)
$barraSnap=New-Object Windows.Forms.TextBox
$barraSnap.AccessibleName='Barra de direcciones'
$barraSnap.Name='urlbar'
$barraSnap.Text=$Url
$barraSnap.Location=New-Object Drawing.Point(20,20)
$barraSnap.Width=560
$formSnap.Controls.Add($barraSnap)
$imagenSnap=New-Object Windows.Forms.PictureBox
$imagenSnap.AccessibleName='Foto de prueba'
$imagenSnap.Location=New-Object Drawing.Point(60,80)
$imagenSnap.Size=New-Object Drawing.Size(320,220)
$imagenSnap.BackColor=[Drawing.Color]::FromArgb(61,220,132)
$formSnap.Controls.Add($imagenSnap)
# Los controles mantienen proveedores accesibles sin verse en el escritorio.
$formSnap.Show()
$handleSnap=$formSnap.Handle
$null=$barraSnap.Handle
$null=$imagenSnap.Handle
@{hwnd=$handleSnap.ToInt64().ToString()}|ConvertTo-Json -Compress
[Console]::Out.Flush()
$relojSnap=New-Object Windows.Forms.Timer
$relojSnap.Interval=60000
$relojSnap.Add_Tick({[Windows.Forms.Application]::ExitThread()})
$relojSnap.Start()
try {[Windows.Forms.Application]::Run((New-Object Windows.Forms.ApplicationContext))}finally{$relojSnap.Dispose();$formSnap.Dispose()}
