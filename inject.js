let isDarkModeEnabled;
let cart;
const apiKey = '';
const projectId = '';

function waitForCartUpdate(previousTotal, retries = 10, delay = 300) {
  return new Promise((resolve) => {
    const check = () => {
      if (retries <= 0) return resolve(false);
      injectPageScript();

      setTimeout(() => {
        if (cart?.prices?.total?.amount !== previousTotal) return resolve(true);
        check(--retries);
      }, delay);
    };
    check();
  });
}

document.addEventListener('click', async (event) => {
  const panel = document.querySelector("#share-cart-addon-panel");
  if (panel.contains(event.target)) return;

  const target = event.target.closest('button[data-cy="number-picker.increase"], button[data-cy="number-picker.decrease"], input[type="checkbox"],button');
  if (!target) return;

  const button = document.querySelector("#share-cart-addon-button");


  panel.hidden = true;
  button.disabled = true;

  const previousTotal = cart?.prices?.total?.amount;
  await waitForCartUpdate(previousTotal);

  const checkboxes = document.querySelectorAll("input[type='checkbox']:checked").length;
  button.disabled = checkboxes < 1;
});

document.addEventListener('change', async (event) => {
  const target = event.target.closest('input[data-cy="number-picker.input"]');
  if (!target) return;

  const button = document.querySelector("#share-cart-addon-button");
  const panel = document.querySelector("#share-cart-addon-panel");

  panel.hidden = true;
  button.disabled = true;

  const previousTotal = cart?.prices?.total?.amount;
  await waitForCartUpdate(previousTotal);

  const checkboxes = document.querySelectorAll("input[type='checkbox']:checked").length;
  button.disabled = checkboxes < 1;
});

window.addEventListener("opboxData", (event) => {
  isDarkModeEnabled = event.detail.isDarkModeEnabled;
  cart = event.detail.cart;
});

function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('pageScript.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}
injectPageScript();

(async () => {
  const res = await fetch(chrome.runtime.getURL("inject.html"));
  const html = await res.text();
  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelector("button#share-cart-addon-button img").src = chrome.runtime.getURL("icons/cart-arrow-up.svg");
  container.querySelector("button#share-cart-addon-button-load img").src = chrome.runtime.getURL("icons/cart-arrow-down.svg");

  document.querySelector("header").insertAdjacentElement("beforeend", container);

  const close = container.querySelector("#share-cart-addon-panel a#close");
  if (close) {
    close.addEventListener("click", () => {
      document.querySelector("#share-cart-addon-panel").hidden = true;
    });
  }

  const copyUserIdButton = container.querySelector("#share-cart-addon-panel button#copyUserId");
  if (copyUserIdButton) {
    copyUserIdButton.addEventListener("click", () => {
      navigator.clipboard.writeText(document.querySelector('input#userId').value)
    });
  }

  const selectElement = document.querySelector("div#share-cart-addon-panel select#koszyk")
  //add saved ids from local storage
  let { savedUsersIds } = await chrome.storage.local.get('savedUsersIds')
  savedUsersIds = savedUsersIds || [];
  savedUsersIds.forEach(value => {
    selectElement.add(new Option(value.split(" ")[1] || value, value.split(" ")[0], false, false));
  });


  const buttonExport = container.querySelector("#share-cart-addon-button");
  const buttonImport = container.querySelector("#share-cart-addon-button-load");

  buttonExport.addEventListener("click", async () => {
    setLoading(true)
    document.querySelector("#share-cart-addon-panel div#koszyki").innerHTML = "";

    let userData = await chrome.storage.local.get(["localId", "idToken", "refreshToken", "displayName"]);
    if (!userData.localId) { userData = await signIn() };

    document.querySelector("#share-cart-addon-panel input#userId").value = userData.displayName;
    if (!selectElement.querySelector(`option[value="${userData.displayName}"]`)) {
      selectElement.add(new Option("mój", userData.displayName, false, true));
    }
    selectElement.value = userData.displayName

    await exportAndRenderCart();
    setLoading(false)
  });

  buttonImport.addEventListener("click", async () => {

    setLoading(true)
    document.querySelector("#share-cart-addon-panel div#koszyki").innerHTML = "";

    let userData = await chrome.storage.local.get(["localId", "idToken", "refreshToken", "displayName"]);
    if (!userData.localId) { userData = await signIn() };

    document.querySelector("#share-cart-addon-panel input#userId").value = userData.displayName;
    if (!selectElement.querySelector(`option[value="${userData.displayName}"]`)) {
      selectElement.add(new Option("mój", userData.displayName, false, true));
    }

    const id = selectElement.value
    await renderSavedCartsOnly(id);
    setLoading(false)
  });

  //addUserId logic
  container.querySelector("#addUserIdSubmit").addEventListener("click", async () => {
    const id = container.querySelector("#addUserId").value.trim()
    if (id == "") { return }
    selectElement.add(new Option(id.split(" ")[1] || id, id.split(" ")[0], false, true));
    container.querySelector("#addUserId").value = ""

    let { savedUsersIds } = await chrome.storage.local.get('savedUsersIds')
    savedUsersIds = savedUsersIds || [];
    if (!savedUsersIds.includes(id)) {
      savedUsersIds.push(id);
      chrome.storage.local.set({ savedUsersIds });
    }

    await renderSavedCartsOnly(id.split(" ")[0])
  })

  //remove userId logic
  container.querySelector("#removeUserIdButton").addEventListener("click", async () => {
    let { savedUsersIds } = await chrome.storage.local.get('savedUsersIds')
    savedUsersIds = savedUsersIds || [];
    // Filter out the one you want to delete
    const updatedValues = savedUsersIds.filter(id => id !== selectElement.value + " " + selectElement.textContent);
    // Save the updated array back
    await chrome.storage.local.set({ savedUsersIds: updatedValues });

    selectElement.querySelector(`option[value="${selectElement.value}"]`)?.remove();
  })



  //change userId logic
  container.querySelector("select#koszyk").addEventListener("change", async (event) => {
    const id = event.target.value
    await renderSavedCartsOnly(id)
  })

  // Add-to-cart logic
  document.querySelector("#share-cart-addon-panel").addEventListener("click", async (e) => {
    const addToCartButton = e.target.closest(".add-to-cart");
    const openLinksButton = e.target.closest(".open-links");
    if (!addToCartButton && !openLinksButton) return;

    if (openLinksButton) {
      const items = openLinksButton.closest(".main").querySelectorAll(".item");

      items.forEach(item => {
        window.open(item.firstElementChild.href, "_blank");
      })
      return
    }

    const mainContainer = addToCartButton.closest(".main");
    const items = mainContainer.querySelectorAll(".item");

    const payload = Array.from(items).map(item => ({
      itemId: item.dataset.id,
      delta: parseInt(item.dataset.quantity, 10)
    }));

    await addToCart(payload);
    window.location.reload();
  });

})();

// ---- CORE LOGIC ---- //

async function exportAndRenderCart() {
  const result = {
    totalPrice: cart.prices.total.amount,
    items: [],
    localdate: new Date().toISOString() // or any formatted string you want
  };

  cart.groups.forEach(group => {
    group.items.forEach(item => {
      if (item.selected) {
        const offer = item.offers.find(o => o.primary);
        if (offer) {
          result.items.push({
            id: offer.id,
            url: offer.url,
            name: offer.name,
            price: item.price.amount,
            quantity: item.quantity.selected
          });
        }
      }
    });
  });

  await createOrUpdateUserKoszykiDocument(result);
  await renderSavedCartsOnly();
}

async function renderSavedCartsOnly(localId) {
  const koszyki = await fetchUserMessages(localId);

  const container = document.querySelector("#share-cart-addon-panel div#koszyki");
  container.innerHTML = "";

  if (!koszyki.length) {
    container.innerHTML = "<p>Brak zapisanych koszyków.</p>";
  } else {

    koszyki.forEach((element, index) => {
      const koszykFields = element.fields;
      const itemsArray = koszykFields.items?.arrayValue?.values || [];
      const totalPrice = koszykFields.totalPrice?.stringValue || "0.00";
      const dateISO = koszykFields.localdate?.stringValue || "";
      const date = dateISO ? new Date(dateISO).toLocaleString() : "";

      const itemsHTML = itemsArray.map(item => {
        const fields = item.mapValue.fields;
        const name = fields.name?.stringValue || "Unnamed";

        const safeTitle = name
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

        const url = fields.url?.stringValue || "#";
        const id = fields.id?.stringValue || "";
        const quantity = fields.quantity?.integerValue || 1;
        const price = fields.price?.stringValue || fields.price?.doubleValue || "0";


        return `
        <div class="item" data-id="${id}" data-quantity="${quantity}">
          <a href="${url}" target="_blank" title="${safeTitle}">${name}</a>
          <span class="price">${price}</span>
          <span class="counter">x${quantity}</span>
        </div>`;
      }).join("");

      container.insertAdjacentHTML("afterbegin", `
      <div class="main">
        <div class="top-row">
          <div class="order">#${index + 1}</div>
          <div class="date">${date}</div>
        </div>
        <div class="items">${itemsHTML}</div>
        <div class="price-total">${totalPrice} zł</div>
        <div class="bottom-menu">
          <div class="open-links">otwórz linki</div>
          <div class="add-to-cart">dodaj do koszyka</div>
        </div>
      </div>`);
    });
  }

  function themeSwitch() {
    document.querySelector('#controls input').checked = isDarkModeEnabled
    // Background styling
    document.querySelectorAll("#share-cart-addon-panel div#koszyki .main")
      .forEach(el => {
        el.style.background = isDarkModeEnabled ? "rgb(57, 57, 57)" : "rgba(255, 255, 255, 1)";
        el.style.outline = isDarkModeEnabled ? "rgb(77, 77, 77) solid 2px" : "2px solid #fff";
      });

    document.querySelectorAll("#share-cart-addon-panel div#koszyki .main .item, .bottom-menu")
      .forEach(el => {
        el.style.background = isDarkModeEnabled ? "rgb(34, 34, 34)" : "rgba(211, 211, 211, 0.5)";
      });

    document.querySelector("#share-cart-addon-panel").style.background = isDarkModeEnabled ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)";
    document.querySelector('meta[name="color-scheme"]').content = isDarkModeEnabled ? 'dark' : 'light'
  }
  themeSwitch()
  document.querySelector("#share-cart-addon-panel").hidden = false;

  const switchThemeButton = document.querySelector('#controls input');
  switchThemeButton.addEventListener('click', () => {
    const colorScheme = document.querySelector('meta[name="color-scheme"]');
    switchThemeButton.addEventListener('change', () => {
      colorScheme.content = switchThemeButton.checked ? 'dark' : 'light';
      isDarkModeEnabled = switchThemeButton.checked ? true : false;
      themeSwitch()
    });
  });


}





// ---- FIRESTORE + AUTH HELPERS ---- //

async function signIn() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });

  if (!response.ok) {
    throw new Error(`Sign-in failed: ${response.status}`);
  }

  const authData = await response.json();
  const { idToken, localId, refreshToken } = authData;

  const displayNamePart = await genName()

  const n = await getKoszykiCount(idToken) + 1
  const displayName = displayNamePart + '-' + n
  const userData = { localId, idToken, refreshToken, displayName };

  // Save to local storage
  await chrome.storage.local.set(userData);

  await ensureKoszykExists()

  return userData;
}

async function ensureKoszykExists() {
  let userData = await chrome.storage.local.get(["localId", "idToken", "refreshToken", "displayName"]);
  if (!userData.localId) {
    userData = await signIn();
  }

  const docUrl =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/koszyki/${userData.displayName}`;

  // Check if koszyk exists
  const getRes = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${userData.idToken}` }
  });

  if (getRes.ok) {
    // koszyk already exists → do nothing
    return;
  }

  if (getRes.status !== 404) {
    throw new Error(`Koszyk check failed: ${getRes.status}`);
  }

  // Create EMPTY koszyk
  const body = {
    fields: {
      localId: { stringValue: userData.localId },
      koszyki: {
        arrayValue: {
          values: []
        }
      },
      timestamp: { timestampValue: new Date().toISOString() }
    }
  };

  const createRes = await fetch(docUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userData.idToken}`
    },
    body: JSON.stringify(body)
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create empty koszyk: ${createRes.status}`);
  }
}


async function createOrUpdateUserKoszykiDocument(newKoszyk) {
  let userData = await chrome.storage.local.get(["localId", "idToken", "refreshToken", "displayName"]);
  if (!userData.localId) { userData = await signIn() };

  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/koszyki/${userData.displayName}`;

  try {
    const getResponse = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${userData.idToken}` }
    });

    let updatedKoszyki = [];

    if (getResponse.ok) {
      const existingDoc = await getResponse.json();
      const koszykiArray = existingDoc.fields.koszyki?.arrayValue?.values || [];

      updatedKoszyki = koszykiArray.map(v => v.mapValue.fields);

      // Append new cart converted to Firestore fields
      updatedKoszyki.push(toFirestoreFields(newKoszyk));

      // Keep max 5 carts, oldest first
      if (updatedKoszyki.length > 5) {
        updatedKoszyki.shift();
      }
    } else if (getResponse.status === 404) {
      updatedKoszyki = [toFirestoreFields(newKoszyk)];
    } else if (getResponse.status === 403 || getResponse.status === 401) {
      const newTokens = await refreshIdToken(userData.refreshToken);
      return await createOrUpdateUserKoszykiDocument(newKoszyk);
    } else {
      throw new Error(`GET failed: ${getResponse.status}`);
    }

    const body = {
      fields: {
        localId: { stringValue: userData.localId },
        koszyki: {
          arrayValue: {
            values: updatedKoszyki.map(k => ({ mapValue: { fields: k } }))
          }
        },
        timestamp: { timestampValue: new Date().toISOString() }
      }
    };

    const updateResponse = await fetch(docUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userData.idToken}`
      },
      body: JSON.stringify(body)
    });

    if (!updateResponse.ok) {
      if (updateResponse.status === 403 || updateResponse.status === 401) {
        const newTokens = await refreshIdToken(userData.refreshToken);
        return await createOrUpdateUserKoszykiDocument(newTokens.idToken, newTokens.userId, newTokens.refreshToken, newKoszyk);
      }
      throw new Error(`PATCH failed: ${updateResponse.status}`);
    }

    return await updateResponse.json();

  } catch (error) {
    console.error("Error updating koszyki document:", error);
    throw error;
  }
}

async function fetchUserMessages(optionalLocalId) {
  let userData = await chrome.storage.local.get(["localId", "idToken", "refreshToken", "displayName"]);
  if (!userData.localId) { userData = await signIn() };

  const localId = optionalLocalId || userData.displayName;

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/koszyki/${localId}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${userData.idToken}` }
  });

  if (response.status === 404) return [];

  if (response.status === 403 || response.status === 401) {
    await refreshIdToken(userData.refreshToken);
    return await fetchUserMessages();
  }

  if (!response.ok) {
    throw new Error(`Firestore fetch failed: ${response.status}`);
  }

  const doc = await response.json();
  const koszyki = doc.fields?.koszyki?.arrayValue?.values || [];

  return koszyki.map((entry, index) => ({
    index,
    fields: entry.mapValue.fields
  }));
}


async function refreshIdToken(refreshToken) {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();

  await chrome.storage.local.set({
    localId: data.user_id,
    idToken: data.id_token,
    refreshToken: data.refresh_token
  });

  return {
    localId: data.user_id,
    idToken: data.id_token,
    refreshToken: data.refresh_token
  };

}

async function getKoszykiCount(idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runAggregationQuery`;

  const body = {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [
          {
            collectionId: "koszyki"
          }
        ]
      },
      aggregations: [
        {
          alias: "count",
          count: {}
        }
      ]
    }
  };


  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  // Firestore returns an array
  return Number(data[0].result.aggregateFields.count.integerValue);
}


async function addToCart(items) {
  await fetch("https://edge.allegro.pl/carts/changeQuantityCommand", {
    "credentials": "include",
    "headers": {
      "Accept": "application/vnd.allegro.public.v5+json",
      "Content-Type": "application/vnd.allegro.public.v5+json"
    },
    "body": JSON.stringify({ items }),
    "method": "POST"
  });
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      fields[key] = Number.isInteger(value)
        ? { integerValue: value.toString() }
        : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (value === null) {
      fields[key] = { nullValue: null };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(item => toFirestoreFields({ temp: item }).temp)
        }
      };
    } else if (typeof value === 'object') {
      fields[key] = {
        mapValue: {
          fields: toFirestoreFields(value)
        }
      };
    }
  }
  return fields;
}

function setLoading(isLoading) {
  const loader = document.getElementById("share-cart-loader");
  if (!loader) return;
  loader.hidden = !isLoading;
}

async function genName() {
  try {
    const friendlyName = await chrome.runtime.sendMessage({ action: "fetch" });
    return friendlyName;
  } catch (err) {
    console.error("genName failed:", err);
    return "guest";
  }
}
