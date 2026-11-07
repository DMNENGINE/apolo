// AppCap: graba SOLO el audio de un proceso (y sus hijos) con la API de loopback por proceso de Windows.
// Uso: AppCap.exe <pid> <salida.wav> <archivo_stop>
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient {
    [PreserveSig] int Initialize(int shareMode, uint streamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, IntPtr audioSessionGuid);
    [PreserveSig] int GetBufferSize(out uint size);
    [PreserveSig] int GetStreamLatency(out long latency);
    [PreserveSig] int GetCurrentPadding(out uint padding);
    [PreserveSig] int IsFormatSupported(int shareMode, IntPtr pFormat, out IntPtr closest);
    [PreserveSig] int GetMixFormat(out IntPtr format);
    [PreserveSig] int GetDevicePeriod(out long def, out long min);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(IntPtr h);
    [PreserveSig] int GetService([MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
}

[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient {
    [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devPos, out ulong qpcPos);
    [PreserveSig] int ReleaseBuffer(uint frames);
    [PreserveSig] int GetNextPacketSize(out uint frames);
}

[ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivateAudioInterfaceAsyncOperation {
    [PreserveSig] int GetActivateResult(out int hr, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
}

[ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivateAudioInterfaceCompletionHandler {
    void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op);
}

[ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAgileObject { }

[ClassInterface(ClassInterfaceType.None)]
class Handler : IActivateAudioInterfaceCompletionHandler, IAgileObject {
    public ManualResetEvent Done = new ManualResetEvent(false);
    public object Iface; public int Hr;
    public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op) {
        int hr; object o; op.GetActivateResult(out hr, out o); Hr = hr; Iface = o; Done.Set();
    }
}

static class AppCap {
    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = true)]
    static extern int ActivateAudioInterfaceAsync([MarshalAs(UnmanagedType.LPWStr)] string path,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid, IntPtr activationParams,
        IActivateAudioInterfaceCompletionHandler handler, out IActivateAudioInterfaceAsyncOperation op);
    [DllImport("kernel32.dll")] static extern IntPtr CreateEvent(IntPtr a, bool manual, bool init, string name);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);

    const int RATE = 48000, CH = 2, BITS = 16, BLOCK = CH * BITS / 8;

    static int Main(string[] args) {
        if (args.Length < 3) { Console.WriteLine("AppCap <pid> <out.wav> <stopfile>"); return 1; }
        uint pid = uint.Parse(args[0]); string outPath = args[1], stopFile = args[2];

        // AUDIOCLIENT_ACTIVATION_PARAMS: type=1 (process loopback), pid, mode=0 (incluir arbol)
        IntPtr pParams = Marshal.AllocHGlobal(12);
        Marshal.WriteInt32(pParams, 0, 1); Marshal.WriteInt32(pParams, 4, (int)pid); Marshal.WriteInt32(pParams, 8, 0);
        // PROPVARIANT VT_BLOB (65)
        IntPtr pv = Marshal.AllocHGlobal(24);
        for (int i = 0; i < 24; i++) Marshal.WriteByte(pv, i, 0);
        Marshal.WriteInt16(pv, 0, 65); Marshal.WriteInt32(pv, 8, 12); Marshal.WriteIntPtr(pv, 16, pParams);

        var h = new Handler(); IActivateAudioInterfaceAsyncOperation op;
        int hr = ActivateAudioInterfaceAsync("VAD\\Process_Loopback", typeof(IAudioClient).GUID, pv, h, out op);
        if (hr != 0) { Console.WriteLine("Activate hr=0x" + hr.ToString("X")); return 2; }
        h.Done.WaitOne(5000);
        if (h.Hr != 0 || h.Iface == null) { Console.WriteLine("Activate result hr=0x" + h.Hr.ToString("X")); return 3; }
        var client = (IAudioClient)h.Iface;

        IntPtr fmt = Marshal.AllocHGlobal(18);
        Marshal.WriteInt16(fmt, 0, 1); Marshal.WriteInt16(fmt, 2, CH); Marshal.WriteInt32(fmt, 4, RATE);
        Marshal.WriteInt32(fmt, 8, RATE * BLOCK); Marshal.WriteInt16(fmt, 12, BLOCK); Marshal.WriteInt16(fmt, 14, BITS); Marshal.WriteInt16(fmt, 16, 0);
        // LOOPBACK | EVENTCALLBACK | AUTOCONVERTPCM | SRC_DEFAULT_QUALITY
        hr = client.Initialize(0, 0x00020000 | 0x00040000 | 0x80000000 | 0x08000000, 2000000, 0, fmt, IntPtr.Zero);
        if (hr != 0) { Console.WriteLine("Initialize hr=0x" + hr.ToString("X")); return 4; }
        IntPtr ev = CreateEvent(IntPtr.Zero, false, false, null);
        client.SetEventHandle(ev);
        object capObj; hr = client.GetService(typeof(IAudioCaptureClient).GUID, out capObj);
        if (hr != 0) { Console.WriteLine("GetService hr=0x" + hr.ToString("X")); return 5; }
        var cap = (IAudioCaptureClient)capObj;

        var fs = new FileStream(outPath, FileMode.Create); var bw = new BinaryWriter(fs);
        bw.Write(new byte[44]);
        long written = 0; byte[] buf = new byte[RATE * BLOCK];
        var sw = System.Diagnostics.Stopwatch.StartNew();
        client.Start();
        Console.WriteLine("REC"); Console.Out.Flush();
        while (!File.Exists(stopFile)) {
            WaitForSingleObject(ev, 20);
            uint pkt;
            while (cap.GetNextPacketSize(out pkt) == 0 && pkt > 0) {
                IntPtr data; uint frames, flags; ulong a, b;
                if (cap.GetBuffer(out data, out frames, out flags, out a, out b) != 0) break;
                int bytes = (int)frames * BLOCK;
                if (bytes > buf.Length) buf = new byte[bytes];
                if ((flags & 2) != 0) Array.Clear(buf, 0, bytes); else Marshal.Copy(data, buf, 0, bytes);
                bw.Write(buf, 0, bytes); written += frames;
                cap.ReleaseBuffer(frames);
            }
            // rellenar silencio si el proceso no envia audio, para mantener sincronia con el reloj
            long expected = (long)(sw.Elapsed.TotalSeconds * RATE);
            if (expected - written > RATE / 10) {
                long pad = expected - written - RATE / 50;
                byte[] z = new byte[pad * BLOCK]; bw.Write(z); written += pad;
            }
        }
        client.Stop();
        long dataBytes = written * BLOCK;
        bw.Seek(0, SeekOrigin.Begin);
        bw.Write(new char[] { 'R', 'I', 'F', 'F' }); bw.Write((int)(36 + dataBytes));
        bw.Write(new char[] { 'W', 'A', 'V', 'E', 'f', 'm', 't', ' ' }); bw.Write(16);
        bw.Write((short)1); bw.Write((short)CH); bw.Write(RATE); bw.Write(RATE * BLOCK); bw.Write((short)BLOCK); bw.Write((short)BITS);
        bw.Write(new char[] { 'd', 'a', 't', 'a' }); bw.Write((int)dataBytes);
        bw.Close();
        Console.WriteLine("OK " + (written / (double)RATE).ToString("F1") + " s");
        return 0;
    }
}
