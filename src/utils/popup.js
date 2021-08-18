import extension from 'extensionizer'
import { QUERY_TAB_TYPE } from '../constant/specifyType';
import { getActiveTab, openTab } from './commonMsg';

const PopupSize = {
  width: 375,
  height: 600,
};

const lastWindowIds = {};

function checkForError() {
  const { lastError } = extension.runtime;
  if (!lastError) {
    return undefined;
  }
  // if it quacks like an Error, its an Error
  if (lastError.stack && lastError.message) {
    return lastError;
  }
  // repair incomplete error object (eg chromium v77)
  return new Error(lastError.message);
}


function getLastFocusedWindow() {
  return new Promise((resolve, reject) => {
    extension.windows.getLastFocused((windowObject) => {
      const error = checkForError();
      if (error) {
        return reject(error);
      }
      return resolve(windowObject);
    });
  });
}
export async function getDappWindowPosition(){
  let left = 0;
  let top = 0;
  try {
    const lastFocused = await getLastFocusedWindow();
    // Position window in top right corner of lastFocused window.
    top = lastFocused.top;
    left = lastFocused.left + (lastFocused.width - PopupSize.width);
  } catch (_) {
    // The following properties are more than likely 0, due to being
    // opened from the background chrome process for the extension that
    // has no physical dimensions
    const { screenX, screenY, outerWidth } = window;
    top = Math.max(screenY, 0);
    left = Math.max(screenX + (outerWidth - PopupSize.width), 0);
  }
  return {
    top,left
  }
}

async function getCurrentTab(windowId){
  return new Promise(async (resolve)=>{
    let tabs = await getActiveTab(QUERY_TAB_TYPE.GET_TAB_BY_WINDOWID,{windowId})
    resolve(tabs)
  })
}
/**
 * Try open window if no previous window exists.
 * If, previous window exists, try to change the location of this window.
 * Finally, try to recover focusing for opened window.
 * @param url
 */
export async function openPopupWindow(
  url,
  channel = "default",
  windowType= "",
  options = {}
) {
  if(windowType === "dapp"){
    let dappOption = await getDappWindowPosition()
    options = {
      ...options,
      ...dappOption
    }
  }
  const option = Object.assign({
    width: PopupSize.width,
    height: PopupSize.height,
    url: url,
    type: "popup",
  }, options);

  if (lastWindowIds[channel] !== undefined) {
    try {
      const window = await getCurrentTab(lastWindowIds[channel])
      if (window?.length) {
        const tab = window[0];
        if (tab?.id) {
          await extension.tabs.update(tab.id, { active: true, url });
        } else {
          throw new Error("Null window or tabs");
        }
      } else {
        throw new Error("Null window or tabs");
      }
    } catch {
      const createdWindow = await new Promise(resolve => {
        extension.windows.create(option, function (windowData) {
          resolve(windowData)
        })
      })
      lastWindowIds[channel] = createdWindow?.id;
    }
  } else {
    const createdWindow = await new Promise(resolve => {
      extension.windows.create(option, function (windowData) {
        resolve(windowData)
      })
    })
    lastWindowIds[channel] = createdWindow?.id;
  }

  if (lastWindowIds[channel]) {
    try {
      await extension.windows.update(lastWindowIds[channel], {
        focused: true,
      });
    } catch (e) {
    }
  }
  window.lastWindowIds = lastWindowIds
  return lastWindowIds[channel];
}

export function closePopupWindow(channel) {
  (async () => {
    const windowId = lastWindowIds[channel];
    if (windowId) {
      await extension.windows.remove(windowId);
    }
  })();
}

/**
 * window.open() has many options for sizing, but they require different ways to do this per web .
 * So, to avoid this problem, just manually set sizing if new window popup is opened.
 */
export function fitPopupWindow() {
  const gap = {
    width: window.outerWidth - window.innerWidth,
    height: window.outerHeight - window.innerHeight,
  };

  if (extension.windows) {
    extension.windows.getCurrent().then((window) => {
      if (window?.id != null) {
        extension.windows.update(window.id, {
          width: PopupSize.width + gap.width,
          height: PopupSize.height + gap.height,
        });
      }
    });
    return;
  }

  window.resizeTo(PopupSize.width + gap.width, PopupSize.height + gap.height);
}

// Opens current page in a tab, so that it doesn't close when switching
// to other windows (e.g. password manager).
export function openCurrentRouteInPersistentTab() {
  const url = new URL(window.location);
  if (!url.searchParams.has('persistentTab')) {
    url.searchParams.set('persistentTab', '1');
    openTab(url.href);
    window.close();
  }
}
