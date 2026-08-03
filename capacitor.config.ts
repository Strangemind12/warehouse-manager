import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android / Capacitor configuration.
 *
 * This app has a server side (SSR + database), so the Android shell loads the
 * published web app instead of bundling a static copy. Change `server.url` to
 * your own published or custom domain if it differs.
 */
const config: CapacitorConfig = {
  appId: "com.warehousemanager.app",
  appName: "Warehouse Manager",
  webDir: "public",
  server: {
    url: "https://project--5625df80-92d9-443a-a2e0-86dd7b24344e.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0f2e2b",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f2e2b",
    },
  },
};

export default config;
