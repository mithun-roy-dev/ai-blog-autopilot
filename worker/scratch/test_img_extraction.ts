import * as cheerio from 'cheerio';

/**
 * MOCK EXTRACTION LOGIC FROM PUBLISHER SERVICE 
 */

function extractEditorialData(content: string) {
    const postInfoRegex = /```post-info\r?\n([\s\S]*?)```/;
    const match = content.match(postInfoRegex);

    let meta: any = {};
    let htmlContent = content;

    if (match) {
        const blockContent = match[1];
        const lines = blockContent.split('\n');
        lines.forEach(line => {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
                const key = line.substring(0, colonIdx).trim();
                const value = line.substring(colonIdx + 1).trim();
                const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                meta[camelKey] = value;
            }
        });
        htmlContent = content.replace(postInfoRegex, '').trim();
    }

    return { meta, htmlContent };
}

function extractFeaturedImage(html: string) {
    const $ = cheerio.load(html);
    const figure = $('figure').has('img.featured').first();
    
    if (figure.length > 0) {
        const img = figure.find('img.featured');
        return {
            src: img.attr('src') || '',
            alt: img.attr('alt') || '',
            title: img.attr('title') || '',
            figcaption: figure.find('figcaption').text().trim(),
            imageType: 'featured'
        };
    }
    return null;
}

// TEST DATA
const testOutput = `
\`\`\`post-info
h1-title: Can Rabbits Live With Cats? Safe Introduction & Coexistence Tips
meta-title: Can Rabbits Live With Cats? 7 Steps to Safe Bonding
meta-desc: Can rabbits live with cats under one roof? Learn how to assess temperament, introduce them safely in phases, and spot warning signs.
slug: /can-rabbits-live-with-cats
primary-keyword: can rabbits live with cats
secondary-keywords: how to introduce a rabbit and a cat, do cats attack rabbits
longtail-keywords: rabbit and cat compatibility
\`\`\`

<p>Intro text here...</p>
<figure><img class="featured" src="https://r2.dev/img-featured-1.webp" alt="Cat and rabbit resting" title="Can Rabbits Live With Cats Safely Indoors? A Calm Coexistence Guide" style="margin: 0px auto;"><figcaption>Calm coexistence between a cat and rabbit.</figcaption></figure>
<p>More text...</p>
`;

console.log("--- STARTING EXTRACTION TEST ---");

const { meta, htmlContent } = extractEditorialData(testOutput);
console.log("\n[1] Meta Extraction Result:");
console.dir(meta);

const imgData = extractFeaturedImage(htmlContent);
console.log("\n[2] Image Extraction Result:");
console.dir(imgData);

if (imgData) {
    const safeImageTitle = imgData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const ext = imgData.src.split('.').pop()?.split('?')[0] || 'webp';
    const seoFileName = \`\${safeImageTitle}-featured.\${ext}\`;
    console.log("\n[3] Generated SEO Filename:");
    console.log(seoFileName);

    const expectedFileName = "can-rabbits-live-with-cats-safely-indoors-a-calm-coexistence-guide-featured.webp";
    if (seoFileName === expectedFileName) {
        console.log("\n✅ FILENAME MATCH SUCCESS");
    } else {
        console.log("\n❌ FILENAME MATCH FAILED");
        console.log("Expected:", expectedFileName);
    }
}
