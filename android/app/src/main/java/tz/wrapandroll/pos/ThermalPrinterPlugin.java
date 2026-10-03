package tz.wrapandroll.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = {
        @Permission(alias = "bluetoothConnect", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class ThermalPrinterPlugin extends Plugin {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final ExecutorService printerExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        if (requiresBluetoothPermission()) {
            requestPermissionForAlias("bluetoothConnect", call, "onListPermissionResult");
            return;
        }
        resolvePairedDevices(call);
    }

    @PermissionCallback
    private void onListPermissionResult(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission is required to list paired printers.");
            return;
        }
        resolvePairedDevices(call);
    }

    private void resolvePairedDevices(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("This phone does not have Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Turn on Bluetooth, pair the printer in Android Settings, then refresh.");
            return;
        }

        try {
            JSArray devices = new JSArray();
            Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
            for (BluetoothDevice device : bondedDevices) {
                JSObject item = new JSObject();
                item.put("name", device.getName() == null ? "Bluetooth printer" : device.getName());
                item.put("address", device.getAddress());
                devices.put(item);
            }
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("Bluetooth permission was not granted.", error);
        }
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open Android Bluetooth settings.", error);
        }
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (requiresBluetoothPermission()) {
            requestPermissionForAlias("bluetoothConnect", call, "onPrintPermissionResult");
            return;
        }
        printWithPermission(call);
    }

    @PermissionCallback
    private void onPrintPermissionResult(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission is required to print.");
            return;
        }
        printWithPermission(call);
    }

    private void printWithPermission(PluginCall call) {
        String address = call.getString("address", "").trim();
        String text = call.getString("text", "");
        if (address.isEmpty()) {
            call.reject("Select a paired Bluetooth printer in Settings first.");
            return;
        }
        if (text.trim().isEmpty()) {
            call.reject("There is no receipt text to print.");
            return;
        }
        if (text.length() > 24000) {
            call.reject("Receipt is too large to print.");
            return;
        }

        printerExecutor.execute(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    throw new IllegalStateException("Turn on Bluetooth before printing.");
                }
                BluetoothDevice device = adapter.getRemoteDevice(address);
                if (!adapter.getBondedDevices().contains(device)) {
                    throw new IllegalStateException("Printer is not paired. Pair it in Android Bluetooth settings first.");
                }

                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
                OutputStream output = socket.getOutputStream();
                output.write(new byte[] { 0x1b, 0x40 });
                output.write(toPrinterBytes(text));
                output.write("\n\n\n".getBytes(StandardCharsets.US_ASCII));
                output.write(new byte[] { 0x1d, 0x56, 0x00 });
                output.flush();

                JSObject result = new JSObject();
                result.put("printed", true);
                result.put("address", address);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Bluetooth printing failed." : error.getMessage(), error);
            } finally {
                if (socket != null) {
                    try {
                        socket.close();
                    } catch (Exception ignored) {}
                }
            }
        });
    }

    private byte[] toPrinterBytes(String text) {
        String printable = text.replaceAll("[^\\x09\\x0A\\x0D\\x20-\\x7E]", "?");
        return printable.getBytes(StandardCharsets.US_ASCII);
    }

    private boolean requiresBluetoothPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !hasBluetoothPermission();
    }

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || getPermissionState("bluetoothConnect") == PermissionState.GRANTED;
    }
}