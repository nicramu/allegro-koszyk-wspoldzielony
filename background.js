chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetch") {
    generateName()
      .then(name => sendResponse(name))
      .catch(err => sendResponse({ error: err.message }));
    return true; // 🔥 Keeps sendResponse alive asynchronously
  }
});


async function generateName() {
    // let adverb = await getAdverb()
    let adjective = await getAdjective()
    let noun = await getNoun()
    //if noun is femine, adj should be femine
    if (noun.gender == "f") {
        adjective = adjective.slice(0, -1) + "a"
    }
    let result = [adjective.replaceAll("_", "-"), noun.noun.replaceAll("_", "-")]
    // console.log("name generated", result.join("-"))

    return result = result.join("-").toLowerCase()
}

async function getAdjective() {
    const page = await fetch("https://pl.wiktionary.org/wiki/Special:RandomInCategory?wpcategory=Kategoria%3AJęzyk_polski_-_przymiotniki")
    const params = page.url.split("?")[1]
    const adjective = new URLSearchParams(params).get("title")

    if (adjective.includes("_")) {
        return adjective.split("_")[1]
    }
    return adjective
}

async function getAdverb() {
    const page = await fetch("https://pl.wiktionary.org/wiki/Special:RandomInCategory?wpcategory=Kategoria%3AJęzyk_polski_-_przysłówki")
    const params = page.url.split("?")[1]
    const adverb = new URLSearchParams(params).get("title")
    return adverb
}

async function getNoun() {
    const genders = ["m", "f"]
    const gender = genders[Math.floor(Math.random() * genders.length)];
    let page
    switch (gender) {
        case "m":
            page = await fetch("https://pl.wiktionary.org/wiki/Special:RandomInCategory?wpcategory=Kategoria%3AJęzyk_polski_-_rzeczowniki_rodzaju_męskozwierzęcego")
            break;
        case "f":
            page = await fetch("https://pl.wiktionary.org/wiki/Special:RandomInCategory?wpcategory=Kategoria%3AJęzyk_polski_-_rzeczowniki_rodzaju_żeńskiego")
            break;
        default:
            page = await fetch("https://pl.wiktionary.org/wiki/Special:RandomInCategory?wpcategory=Kategoria%3AJęzyk_polski_-_rzeczowniki_rodzaju_męskozwierzęcego")
    }
    const params = page.url.split("?")[1]
    const noun = new URLSearchParams(params).get("title")
    return { noun: noun, gender: gender }
}