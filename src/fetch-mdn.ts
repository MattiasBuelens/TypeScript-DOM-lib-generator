import * as fs from "fs";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { listAll as listAllIdl } from "@webref/idl";
import * as webidl2 from "webidl2";

interface Page {
  summary: string;
}

const knownBadDescriptions = [
  "CustomEvent", // too vague; references truncated data
  "IDBTransaction", // just a comment about Firefox 40
  "RTCDtmfSender", // is just 'tbd'
  "SVGMatrix", // too vague; references truncated data
];

fetchInterfaceDescriptions();

async function fetchInterfaceDescriptions() {
  const interfaceNames = (await getAllIdlInterfaces()).slice(0, 5);
  const descriptions: Record<string, string> = {};

  console.log(`Fetching ${interfaceNames.length} interface descriptions...`);
  await interfaceNames.reduce(async (previousRequest, name, index) => {
    // Issuing too many requests in parallel causes 504 gateway errors, so chain
    await previousRequest;

    if (index % 25 === 0) {
      console.log(`...Fetched ${index} pages`);
      flush();
    }

    const response = await fetch(
      `https://developer.mozilla.org/en-US/docs/Web/API/${name}$json`
    );
    if (response.ok) {
      const page: any = await response.json();
      addDescription(name, page);
    } else if (response.status !== 404) {
      throw new Error(`Failed to fetch ${name}: ${response.statusText}`);
    }
  }, Promise.resolve());

  flush();

  function addDescription(name: string, page: Page) {
    if (page.summary && !knownBadDescriptions.includes(name)) {
      const fragment = JSDOM.fragment(page.summary);
      descriptions[name] = fragment.textContent!;
    }
  }

  function flush() {
    fs.writeFileSync(
      "inputfiles/mdn/apiDescriptions.json",
      JSON.stringify(descriptions, null, 2)
    );
  }
}

async function getAllIdlInterfaces(): Promise<string[]> {
  const idl = await listAllIdl();
  const interfaceNames = new Set<string>();
  for (const [, file] of Object.entries(idl)) {
    const text = await file.text();
    const rootTypes = webidl2.parse(text);
    for (const rootType of rootTypes) {
      if (rootType.type === "interface") {
        interfaceNames.add(rootType.name);
      }
    }
  }
  return [...interfaceNames].sort();
}
