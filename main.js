const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog } = require('electron');
const { iniciarServidor, detenerServidor } = require('./server');

let ventanaPrincipal = null;
const NOMBRE_DIRECTORIO_DATOS = 'CLIB_CAFCAM';

function directorioEsEscribible(ruta) {
  try {
    fs.mkdirSync(ruta, { recursive: true });
    const archivoPrueba = path.join(ruta, `.write-test-${process.pid}`);
    fs.writeFileSync(archivoPrueba, 'ok', { encoding: 'utf8' });
    fs.unlinkSync(archivoPrueba);
    return true;
  } catch (error) {
    return false;
  }
}

function configurarRutasDeDatos() {
  const candidatos = [
    path.join(app.getPath('appData'), NOMBRE_DIRECTORIO_DATOS),
    path.join(app.getPath('temp'), NOMBRE_DIRECTORIO_DATOS)
  ];
  const rutaBase = candidatos.find((ruta) => directorioEsEscribible(ruta));
  if (!rutaBase) {
    return;
  }

  const rutaSesion = path.join(rutaBase, 'SessionData');
  if (!directorioEsEscribible(rutaSesion)) {
    return;
  }

  app.setPath('userData', rutaBase);
  app.setPath('sessionData', rutaSesion);
  app.commandLine.appendSwitch('disk-cache-dir', path.join(rutaSesion, 'Cache'));
}

configurarRutasDeDatos();

async function crearVentana() {
  const { puerto } = await iniciarServidor({ puertoPreferido: 0 });
  ventanaPrincipal = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'CLIB CAFCAM',
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
      'CLIB CAFCAM',
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
