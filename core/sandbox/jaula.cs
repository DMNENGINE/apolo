// APOLO · jaula del sandbox "restringido" (Windows). Lo compila core/sandbox/windows.js con Add-Type de PowerShell
// (-OutputType ConsoleApplication) a <datos>/sandbox/apolo-jaula-<hash>.exe. Sin dependencias: solo P/Invoke a kernel32/advapi32.
// Archivo guardado con BOM UTF-8 (PowerShell 5.1 lee como ANSI los archivos sin BOM).
//
//   apolo-jaula.exe mem=<MB> cpu=<1-100> procs=<n> seg=<s> baja=<0|1> cwd=<dir> -- programa arg1 arg2 ...
//     · crea un Job Object con: límite de memoria del job (JOB_MEMORY), nº máximo de procesos activos (ACTIVE_PROCESS),
//       tope duro de CPU (CPU_RATE_CONTROL HARD_CAP), KILL_ON_JOB_CLOSE (si la jaula muere, muere todo lo de dentro),
//       DIE_ON_UNHANDLED_EXCEPTION y restricciones de UI (portapapeles, ajustes del sistema, escritorios, apagar Windows,
//       átomos globales, handles de USER de fuera del job);
//     · baja=1: token propio duplicado con CreateRestrictedToken(DISABLE_MAX_PRIVILEGE) + nivel de integridad BAJO (S-1-16-4096);
//     · arranca el programa suspendido, lo mete en el job, lo reanuda y vigila el puerto de finalización del job:
//       memoria superada → TerminateJobObject (código 137) · tiempo → (124) · intento de superar procesos → se anota.
//     Mensajes de la jaula por stderr con el prefijo "[sandbox]". El código de salida es el del programa (o 124/137).
//   apolo-jaula.exe etiquetar=<baja|nolectura> <ruta>...
//     baja: etiqueta "Low" heredable (OI)(CI) con no-write-up → el proceso de baja integridad puede escribir ahí.
//     nolectura: etiqueta "Medium" con no-write-up + NO-READ-UP → un proceso de baja integridad ni la lee.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ApoloJaula
{
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT
    {
        public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
        public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct EXT_LIMIT
    {
        public BASIC_LIMIT Basic; public IO_COUNTERS Io; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential)] struct CPU_RATE { public uint ControlFlags; public uint CpuRate; }
    [StructLayout(LayoutKind.Sequential)] struct UI_RESTRICT { public uint UIRestrictionsClass; }
    [StructLayout(LayoutKind.Sequential)] struct PORT_INFO { public IntPtr CompletionKey; public IntPtr CompletionPort; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO
    {
        public int cb; public string lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)] struct PROC_INFO { public IntPtr hProcess, hThread; public int pid, tid; }
    [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr a, string n);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref EXT_LIMIT i, int len);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref CPU_RATE i, int len);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref UI_RESTRICT i, int len);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref PORT_INFO i, int len);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateIoCompletionPort(IntPtr f, IntPtr existing, IntPtr key, uint n);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetQueuedCompletionStatus(IntPtr port, out uint msg, out IntPtr key, out IntPtr ov, uint ms);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inh, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROC_INFO pi);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcessAsUser(IntPtr tok, string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inh, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROC_INFO pi);
    [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr t);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr p, uint code);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int n);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr p, out uint code);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr p, uint acc, out IntPtr tok);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool CreateRestrictedToken(IntPtr tok, uint flags, uint nd, IntPtr d, uint np, IntPtr p, uint nr, IntPtr r, out IntPtr nuevo);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSidToSid(string s, out IntPtr sid);
    [DllImport("advapi32.dll")] static extern int GetLengthSid(IntPtr sid);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr tok, int cls, IntPtr info, int len);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, uint rev, out IntPtr sd, out uint len);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetSecurityDescriptorSacl(IntPtr sd, out bool presente, out IntPtr sacl, out bool porDefecto);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern uint SetNamedSecurityInfo(string nombre, int tipo, uint info, IntPtr o, IntPtr g, IntPtr dacl, IntPtr sacl);

    const uint LIMIT_ACTIVE_PROCESS = 0x8, LIMIT_JOB_MEMORY = 0x200, LIMIT_DIE_ON_EXC = 0x400, LIMIT_KILL_ON_CLOSE = 0x2000;
    const int CLS_EXT = 9, CLS_UI = 4, CLS_PORT = 7, CLS_CPU = 15;
    const uint MSG_ACTIVE_LIMIT = 3, MSG_ZERO = 4, MSG_PROC_MEM = 9, MSG_JOB_MEM = 10;

    static System.IO.StreamWriter err;
    static void Log(string s) { try { if (err == null) err = new System.IO.StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = true }; err.WriteLine("[sandbox] " + s); } catch { } }

    static string Q(string a)
    {
        if (a.Length > 0 && a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return a;
        var sb = new StringBuilder("\""); int bs = 0;
        foreach (char c in a)
        {
            if (c == '\\') { bs++; continue; }
            if (c == '"') { sb.Append('\\', bs * 2 + 1); sb.Append('"'); } else { sb.Append('\\', bs); sb.Append(c); }
            bs = 0;
        }
        sb.Append('\\', bs * 2); sb.Append('"'); return sb.ToString();
    }

    static int Etiquetar(string modo, List<string> rutas)
    {
        // LW = Low (heredable a archivos y carpetas nuevos); ME = Medium con NO_READ_UP además de NO_WRITE_UP
        string sddl = modo == "baja" ? "S:(ML;OICI;NW;;;LW)" : "S:(ML;;NWNR;;;ME)";
        IntPtr sd; uint len; IntPtr sacl; bool pres, def; int fallos = 0;
        if (!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl, 1, out sd, out len) || !GetSecurityDescriptorSacl(sd, out pres, out sacl, out def)) { Log("no pude construir la etiqueta"); return 2; }
        foreach (var r in rutas)
        {
            uint e = SetNamedSecurityInfo(r, 1 /*SE_FILE_OBJECT*/, 0x10 /*LABEL_SECURITY_INFORMATION*/, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, sacl);
            if (e != 0) { fallos++; Log("etiqueta " + modo + " falló en " + r + " (error " + e + ")"); }
        }
        return fallos == 0 ? 0 : 3;
    }

    public static int Main(string[] args)
    {
        var o = new Dictionary<string, string>(); int i = 0;
        for (; i < args.Length && args[i] != "--"; i++) { int k = args[i].IndexOf('='); if (k > 0) o[args[i].Substring(0, k)] = args[i].Substring(k + 1); }
        if (o.ContainsKey("etiquetar")) { var rs = new List<string>(); for (int j = 0; j < args.Length; j++) if (args[j].IndexOf('=') < 0 && args[j] != "--") rs.Add(args[j]); return Etiquetar(o["etiquetar"], rs); }
        if (i >= args.Length - 1) { Log("uso: mem= cpu= procs= seg= baja= cwd= -- programa args"); return 2; }
        var cmd = new StringBuilder(); for (int j = i + 1; j < args.Length; j++) { if (cmd.Length > 0) cmd.Append(' '); cmd.Append(Q(args[j])); }
        Func<string, long, long> num = (k, d) => { long v; return o.ContainsKey(k) && long.TryParse(o[k], out v) ? v : d; };
        long mem = num("mem", 512), cpu = num("cpu", 50), procs = num("procs", 4), seg = num("seg", 120);
        bool baja = num("baja", 1) == 1; string cwd = o.ContainsKey("cwd") ? o["cwd"] : null;

        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) { Log("no pude crear el Job Object"); return 2; }
        var ext = new EXT_LIMIT();
        ext.Basic.LimitFlags = LIMIT_KILL_ON_CLOSE | LIMIT_DIE_ON_EXC | LIMIT_JOB_MEMORY | LIMIT_ACTIVE_PROCESS;
        ext.Basic.ActiveProcessLimit = (uint)Math.Max(1, procs);
        ext.JobMemoryLimit = new UIntPtr((ulong)Math.Max(16, mem) * 1024UL * 1024UL);
        if (!SetInformationJobObject(job, CLS_EXT, ref ext, Marshal.SizeOf(typeof(EXT_LIMIT)))) { Log("no pude poner los límites del job (" + Marshal.GetLastWin32Error() + ")"); return 2; }
        if (cpu > 0 && cpu < 100)
        {
            var cr = new CPU_RATE { ControlFlags = 0x1 | 0x4, CpuRate = (uint)(cpu * 100) };   // ENABLE | HARD_CAP, en 1/100 de %
            if (!SetInformationJobObject(job, CLS_CPU, ref cr, Marshal.SizeOf(typeof(CPU_RATE)))) Log("aviso: el tope de CPU no se pudo aplicar (" + Marshal.GetLastWin32Error() + ")");
        }
        var ui = new UI_RESTRICT { UIRestrictionsClass = 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40 | 0x80 };   // handles, portapapeles L/E, ajustes, pantalla, átomos, escritorios, apagar
        SetInformationJobObject(job, CLS_UI, ref ui, Marshal.SizeOf(typeof(UI_RESTRICT)));
        IntPtr port = CreateIoCompletionPort(new IntPtr(-1), IntPtr.Zero, IntPtr.Zero, 1);
        var pinfo = new PORT_INFO { CompletionKey = new IntPtr(1), CompletionPort = port };
        SetInformationJobObject(job, CLS_PORT, ref pinfo, Marshal.SizeOf(typeof(PORT_INFO)));

        var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.dwFlags = 0x100;   // STARTF_USESTDHANDLES
        si.hStdInput = GetStdHandle(-10); si.hStdOutput = GetStdHandle(-11); si.hStdError = GetStdHandle(-12);
        PROC_INFO pi; bool ok; uint flags = 0x4 | 0x08000000;   // CREATE_SUSPENDED | CREATE_NO_WINDOW
        if (baja)
        {
            IntPtr tok, rtok, sid;
            if (!OpenProcessToken(GetCurrentProcess(), 0x0002 | 0x0008 | 0x0080 | 0x0001, out tok)) { Log("OpenProcessToken falló (" + Marshal.GetLastWin32Error() + ")"); return 2; }
            if (!CreateRestrictedToken(tok, 0x1 /*DISABLE_MAX_PRIVILEGE*/, 0, IntPtr.Zero, 0, IntPtr.Zero, 0, IntPtr.Zero, out rtok)) { Log("CreateRestrictedToken falló (" + Marshal.GetLastWin32Error() + ")"); return 2; }
            ConvertStringSidToSid("S-1-16-4096", out sid);
            int tam = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES)) + GetLengthSid(sid);
            IntPtr buf = Marshal.AllocHGlobal(tam);
            Marshal.StructureToPtr(new SID_AND_ATTRIBUTES { Sid = sid, Attributes = 0x20 /*SE_GROUP_INTEGRITY*/ }, buf, false);
            if (!SetTokenInformation(rtok, 25 /*TokenIntegrityLevel*/, buf, tam)) { Log("no pude bajar la integridad del token (" + Marshal.GetLastWin32Error() + ")"); return 2; }
            ok = CreateProcessAsUser(rtok, null, cmd, IntPtr.Zero, IntPtr.Zero, true, flags, IntPtr.Zero, cwd, ref si, out pi);
        }
        else ok = CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, true, flags, IntPtr.Zero, cwd, ref si, out pi);
        if (!ok) { Log("no pude arrancar el programa (" + Marshal.GetLastWin32Error() + "): " + cmd); return 2; }
        if (!AssignProcessToJobObject(job, pi.hProcess)) { Log("no pude meter el proceso en el job (" + Marshal.GetLastWin32Error() + ")"); TerminateProcess(pi.hProcess, 2); return 2; }
        ResumeThread(pi.hThread); CloseHandle(pi.hThread);

        DateTime fin = DateTime.UtcNow.AddSeconds(Math.Max(1, seg)); int propio = -1; bool avisoProc = false;
        while (true)
        {
            uint msg; IntPtr key, ov;
            bool hay = GetQueuedCompletionStatus(port, out msg, out key, out ov, 200);
            if (hay)
            {
                if (msg == MSG_ZERO) break;
                if (msg == MSG_JOB_MEM || msg == MSG_PROC_MEM) { Log("memoria: superó el límite de " + mem + " MB → matado"); TerminateJobObject(job, 137); propio = 137; }
                else if (msg == MSG_ACTIVE_LIMIT && !avisoProc) { avisoProc = true; Log("bloqueado: intentó crear más procesos de los permitidos (" + procs + ")"); }
            }
            // el programa principal terminó: lo que haya dejado vivo dentro del job (nietos "desacoplados") muere con él
            if (WaitForSingleObject(pi.hProcess, 0) == 0) { uint c0; GetExitCodeProcess(pi.hProcess, out c0); TerminateJobObject(job, c0); break; }
            if (propio >= 0 && DateTime.UtcNow > fin.AddSeconds(5)) break;
            if (propio < 0 && DateTime.UtcNow > fin) { Log("tiempo: superó " + seg + " s → matado"); TerminateJobObject(job, 124); propio = 124; }
        }
        uint code; GetExitCodeProcess(pi.hProcess, out code);
        CloseHandle(pi.hProcess); CloseHandle(job);
        return propio >= 0 ? propio : (int)code;
    }

}
