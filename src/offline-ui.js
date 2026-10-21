(() => {
  const installButton = document.getElementById('install-app');
  const installStatus = document.getElementById('install-status');
  const prepareButton = document.getElementById('prepare-offline');
  const offlineStatus = document.getElementById('offline-status');
  let installPrompt;

  function setInstallMessage(message) {
    if (installStatus) installStatus.textContent = message;
  }

  function setOfflineMessage(message) {
    if (offlineStatus) offlineStatus.textContent = message;
  }

  function sendWorkerMessage(type, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) {
        reject(new Error('La aplicación offline todavía se está preparando. Recargá la página e intentá de nuevo.'));
        return;
      }

      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(new Error('La preparación está tardando demasiado. Comprobá la conexión e intentá de nuevo.'));
      }, timeout);

      channel.port1.onmessage = (event) => {
        if (event.data?.type === 'offline-progress') {
          setOfflineMessage(`Guardando recursos: ${event.data.completed} de ${event.data.total}…`);
          return;
        }
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };
      worker.postMessage({ type }, [channel.port2]);
    });
  }

  if (installButton) {
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (isInstalled) {
      installButton.disabled = true;
      installButton.textContent = 'Air Gesture está instalada';
      setInstallMessage('Aplicación instalada en este dispositivo.');
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      installButton.disabled = false;
      setInstallMessage('Instalación web disponible en este navegador.');
    });

    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      installButton.disabled = true;
      installButton.textContent = 'Air Gesture está instalada';
      setInstallMessage('Aplicación instalada en este dispositivo.');
    });

    installButton.addEventListener('click', async () => {
      if (!installPrompt) {
        setInstallMessage('Abrí el menú del navegador y elegí «Instalar aplicación» o «Agregar al Dock», si está disponible.');
        return;
      }
      installButton.disabled = true;
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      setInstallMessage(outcome === 'accepted'
        ? 'Instalación iniciada. Luego prepará los recursos para usarla sin conexión.'
        : 'Instalación cancelada. Podés volver a intentarlo desde este botón.');
      installPrompt = null;
      if (outcome !== 'accepted') installButton.disabled = false;
    });

    if (!isInstalled && !('onbeforeinstallprompt' in window)) {
      setInstallMessage('Usá el menú del navegador para instalar o agregar Air Gesture, si esa opción está disponible.');
    }
  }

  if (!('serviceWorker' in navigator)) {
    if (prepareButton) prepareButton.disabled = true;
    setOfflineMessage('Este navegador no admite preparación offline mediante PWA.');
    return;
  }

  navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    .then(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
          setTimeout(resolve, 3000);
        });
      }
      if (!navigator.serviceWorker.controller) {
        throw new Error('El service worker no controla esta página todavía. Recargala e intentá de nuevo.');
      }
      const status = await sendWorkerMessage('offline-status');
      setOfflineMessage(status.ready
        ? 'Recursos offline preparados en este navegador.'
        : `Faltan ${status.missing} de ${status.total} recursos locales. La preparación ocupa aproximadamente 50 MB.`);
    })
    .catch((error) => {
      if (prepareButton) prepareButton.disabled = true;
      setOfflineMessage(`No se pudo habilitar el modo offline: ${error.message}`);
    });

  if (prepareButton) {
    prepareButton.addEventListener('click', async () => {
      prepareButton.disabled = true;
      setOfflineMessage('Descargando modelos y recursos locales… No cierres esta página.');
      try {
        const result = await sendWorkerMessage('prepare-offline', 300000);
        if (result.type === 'offline-prepared') {
          setOfflineMessage(`Listo: ${result.total} recursos guardados. Air Gesture puede abrirse sin conexión en este navegador.`);
        } else if (result.type === 'offline-error') {
          setOfflineMessage(`No se completó la preparación: ${result.message}`);
        } else {
          throw new Error('El navegador devolvió una respuesta inesperada.');
        }
      } catch (error) {
        setOfflineMessage(`No se completó la preparación: ${error.message}`);
      } finally {
        prepareButton.disabled = false;
      }
    });
  }
})();
