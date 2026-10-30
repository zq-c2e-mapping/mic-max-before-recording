param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'

$coreAudioCode = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace MicMaxBeforeRecording {
    internal enum DataFlow { Render = 0, Capture = 1, All = 2 }

    [ComImport]
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator {
        [PreserveSig] int EnumAudioEndpoints(DataFlow dataFlow, uint stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(DataFlow dataFlow, int role, out IMMDevice endpoint);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport]
    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index, out IMMDevice device);
    }

    [ComImport]
    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice {
        [PreserveSig] int Activate(ref Guid iid, uint classContext, IntPtr activationParams,
            [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        [PreserveSig] int OpenPropertyStore(int access, out IntPtr properties);
        [PreserveSig] int GetId(out IntPtr id);
        [PreserveSig] int GetState(out uint state);
    }

    [ComImport]
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioEndpointVolume {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr client);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr client);
        [PreserveSig] int GetChannelCount(out uint count);
        [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid eventContext);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid eventContext);
        [PreserveSig] int GetMasterVolumeLevel(out float level);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid eventContext);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid eventContext);
        [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid eventContext);
        [PreserveSig] int GetMute(out bool mute);
        [PreserveSig] int GetVolumeStepInfo(out uint step, out uint stepCount);
        [PreserveSig] int VolumeStepUp(ref Guid eventContext);
        [PreserveSig] int VolumeStepDown(ref Guid eventContext);
        [PreserveSig] int QueryHardwareSupport(out uint hardwareSupportMask);
        [PreserveSig] int GetVolumeRange(out float minDb, out float maxDb, out float incrementDb);
    }

    public static class EndpointVolumeSetter {
        private static void Check(int result) {
            if (result < 0) Marshal.ThrowExceptionForHR(result);
        }

        public static int SetAllActiveCaptureEndpointsToMaximum() {
            var clsid = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
            var enumeratorType = Type.GetTypeFromCLSID(clsid, true);
            var enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(enumeratorType);
            IMMDeviceCollection devices = null;
            var errors = new List<string>();
            uint count;

            try {
                Check(enumerator.EnumAudioEndpoints(DataFlow.Capture, 1, out devices));
                Check(devices.GetCount(out count));
                if (count == 0) throw new InvalidOperationException("Windows reports no active recording devices.");

                for (uint index = 0; index < count; index++) {
                    IMMDevice device = null;
                    object endpointObject = null;
                    try {
                        Check(devices.Item(index, out device));
                        var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
                        Check(device.Activate(ref iid, 23, IntPtr.Zero, out endpointObject));
                        var endpoint = (IAudioEndpointVolume)endpointObject;
                        var eventContext = Guid.Empty;
                        Check(endpoint.SetMasterVolumeLevelScalar(1.0f, ref eventContext));
                        float actual;
                        Check(endpoint.GetMasterVolumeLevelScalar(out actual));
                        if (actual < 0.999f)
                            throw new InvalidOperationException("Volume verification returned " + actual + ".");
                    }
                    catch (Exception error) {
                        errors.Add("Recording endpoint " + index + ": " + error.Message);
                    }
                    finally {
                        if (endpointObject != null && Marshal.IsComObject(endpointObject)) Marshal.ReleaseComObject(endpointObject);
                        if (device != null && Marshal.IsComObject(device)) Marshal.ReleaseComObject(device);
                    }
                }

                if (errors.Count > 0) throw new InvalidOperationException(String.Join(Environment.NewLine, errors.ToArray()));
                return (int)count;
            }
            finally {
                if (devices != null && Marshal.IsComObject(devices)) Marshal.ReleaseComObject(devices);
                if (enumerator != null && Marshal.IsComObject(enumerator)) Marshal.ReleaseComObject(enumerator);
            }
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $coreAudioCode -Language CSharp
    if ($CheckOnly) {
        Write-Output 'Core Audio helper compiled successfully.'
        exit 0
    }
    $count = [MicMaxBeforeRecording.EndpointVolumeSetter]::SetAllActiveCaptureEndpointsToMaximum()
    Write-Output "Set and verified $count active recording endpoint(s) at 100%."
    exit 0
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
