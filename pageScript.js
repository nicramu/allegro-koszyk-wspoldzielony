    (function() {
      function waitForOpbox() {
        if (window.opbox && window.opbox.config && window.opboxCart && window.opboxCart.props.cart.cart) {
          window.dispatchEvent(new CustomEvent("opboxData", {
            detail: {
              isDarkModeEnabled: window.matchMedia('(prefers-color-scheme: dark)').matches,
              cart: window.opboxCart.props.cart.cart
            },
            bubbles: true,
            composed: true
          }));
        } else {
          setTimeout(waitForOpbox, 100);
        }
      }
      waitForOpbox();
    })();