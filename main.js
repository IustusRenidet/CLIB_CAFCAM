const { app, BrowserWindow, dialog } = require('electron');
const { iniciarServidor, detenerServidor } = require('./server');

let ventanaPrincipal = null;

async function crearVentana() {
  const { puerto } = await iniciarServidor({ puertoPreferido: 0 });

  ventanaPrincipal = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'CLIB Ventas',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await ventanaPrincipal.loadURL(`http://localhost:${puerto}`);
}

app.whenReady().then(async () => {
  try {
    await crearVentana();
  } catch (error) {
    console.error('No fue posible iniciar la aplicación:', error);
    dialog.showErrorBox(
      'CLIB Ventas',
      `${error?.message || error}\n\nLa instalación podría estar incompleta o el puerto está en uso. Intenta reinstalar o contacta a soporte.`
    );
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await crearVentana();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await detenerServidor();
});
