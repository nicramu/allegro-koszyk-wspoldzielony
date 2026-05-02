(async function () {
  async function waitForOpbox() {
    var res1 = await fetch("https://allegro.pl/koszyk", {
      "credentials": "include",
      "headers": {
        "Accept": "application/vnd.opbox-web.v2+json"
      },
      "method": "GET",
      "mode": "cors"
    });

    var data2 = await res1.json();
    var result = Object.values(data2.boxes).find(
      obj => obj["$box.name"]?.value === "allegro.cart.view"
    );

    window.dispatchEvent(new CustomEvent("opboxData", {
      detail: {
        isDarkModeEnabled: window.matchMedia('(prefers-color-scheme: dark)').matches,
        cart: result.cartData.value.cart
      },
      bubbles: true,
      composed: true
    }));
  }

  window.addEventListener("getCart", async () => {
    await waitForOpbox();
  })

  await waitForOpbox();
})();