import { LOOPS_PER_PAGE, Page, SamplePack } from "../parsers/samples_parser";

export async function generateSamplePack(ids: string[]) {
  if (ids?.length > 10) {
      console.log("pack length too long")
      return null;
  }
  console.log("received IDs:")
  console.log(ids)

  // Create a full list of 10 IDs, filling empty slots with null
  const fullIds = Array(10).fill(null);

  // Shift by one and move last to first
  // this is because the keyboard starts with 1
  if (ids.length > 0) {
    ids.forEach((id, index) => fullIds[index] = id);
  }
  const lastElement = fullIds.pop();
  fullIds.unshift(lastElement);
  
  console.log("created IDs:")
  console.log(fullIds)

  const device_name = "MONKEY"; // TODO: use DIS instead to get the ID of the device
  const pages: Page[] = [];

  // Create pages based on the full IDs list
  for (const id of fullIds) {
      if (id === null) {
          pages.push(null); // Empty page
      } else {
          try {
              const response = await fetch(`/samples/${device_name}/DRM/${id}.json`);
              const pageData = await response.json();
              const page: Page = {
                name: pageData.name,
                loops: pageData.loops
              }
              pages.push(page);
          } catch (e) {
              console.error(`Failed to fetch page for ID ${id}:`, e);
              pages.push(null); // Failed page is also null
          }
      }
  }

  // Create the SamplePack
  const samplePack: SamplePack = {
      reserved0: 0xFFFFFFFF,
      reserved1: 0xFFFFFFFF,
      reserved2: 0xFFFFFFFF,
      reserved3: 0xFFFFFFFF,
      pages: pages,
  };

  return samplePack;
}