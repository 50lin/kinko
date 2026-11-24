import type { CapacitorConfig } from '@capacitor/cli';

// App nativa Android/iOS: empaqueta la web compilada (dist). La API se configura con VITE_API_URL al compilar.
const config: CapacitorConfig = {
  appId: 'app.kinko.mobile',
  appName: 'Kinkō',
  webDir: 'dist',
  backgroundColor: '#0E1514',
  server: { androidScheme: 'https' },
  plugins: { BluetoothLe: { displayStrings: { scanning: 'Buscando dispositivos…', cancel: 'Cancelar', availableDevices: 'Dispositivos disponibles', noDeviceFound: 'No se encontraron dispositivos' } } },
};
export default config;
