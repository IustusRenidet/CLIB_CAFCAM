const { app, BrowserWindow, dialog } = require('electron');
const { iniciarServidor, detenerServidor } = require('./server');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Permitir múltiples instancias
app.requestSingleInstanceLock = () => false;

// Aislar el perfil de cada instancia con un ID único
const instanceId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
const userDataPath = path.join(app.getPath('userData'), 'instances', instanceId);
app.setPath('userData', userDataPath);

let ventanaPrincipal = null;

// Configurar actualizaciones automáticas
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => {
  console.log('Verificando actualizaciones...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Actualización disponible:', info.version);
  dialog.showMessageBox(ventanaPrincipal, {
    type: 'info',
    title: 'Actualización Disponible',
    message: `Hay una nueva versión disponible (${info.version}). ¿Desea descargarla ahora?`,
    buttons: ['Sí', 'Más tarde']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('La aplicación está actualizada');
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Descargando: ${Math.round(progressObj.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox(ventanaPrincipal, {
    type: 'info',
    title: 'Actualización Lista',
    message: `La versión ${info.version} se ha descargado. La aplicación se reiniciará para instalarla.`,
    buttons: ['Reiniciar Ahora', 'Más Tarde']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (err) => {
  console.error('Error en actualización:', err);
});

async function crearVentana() {
  const { puerto } = await iniciarServidor();

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
    
    // Verificar actualizaciones después de 3 segundos
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000);
  } catch (error) {
    console.error('No fue posible iniciar la aplicación:', error);
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
