const cheerio = require('cheerio');
const { marked } = require('marked');

function wrapInGutenbergBlocks(html) {
    const $ = cheerio.load(html);
    let blocks = '';

    // Pre-processing: Remove first H1 and Featured Image
    $('h1').first().remove();
    $('figure').has('img.featured').first().remove();

    $('body').children().each((_, el) => {
        const tag = el.tagName ? el.tagName.toLowerCase() : null;
        if (!tag) return;

        const content = $.html(el);

        if (tag.match(/^h[1-6]$/)) {
            const level = tag.substring(1);
            blocks += `<!-- wp:heading {"level":${level}} -->\n${content}\n<!-- /wp:heading -->\n\n`;
        } else if (tag === 'p') {
            blocks += `<!-- wp:paragraph -->\n${content}\n<!-- /wp:paragraph -->\n\n`;
        } else if (tag === 'ul' || tag === 'ol') {
            blocks += `<!-- wp:list -->\n${content}\n<!-- /wp:list -->\n\n`;
        } else if (tag === 'figure' || tag === 'img') {
            blocks += `<!-- wp:image -->\n${content}\n<!-- /wp:image -->\n\n`;
        } else if (tag === 'blockquote') {
            blocks += `<!-- wp:quote -->\n${content}\n<!-- /wp:quote -->\n\n`;
        } else {
            blocks += `<!-- wp:html -->\n${content}\n<!-- /wp:html -->\n\n`;
        }
    });

    return blocks || html;
}

// TEST DATA
const testMarkdown = `
# How to Care for Rabbits

This is a great intro paragraph.

## Feeding Your Rabbit
*   Hay (Timothy or Alfalfa)
*   Fresh Greens

<figure><img class="featured" src="featured.webp"> <figcaption>Ignore me</figcaption></figure>

## Conclusion
Final thoughts.
`;

console.log("--- STARTING GUTENBERG BLOCK TEST ---");

const html = marked.parse(testMarkdown);
const blocks = wrapInGutenbergBlocks(html);

console.log("\n[1] Resulting Gutenberg Blocks Payload:");
console.log(blocks);

if (blocks.includes('<!-- wp:paragraph -->') && blocks.includes('<!-- wp:heading {"level":2} -->')) {
    console.log("\n✅ SUCCESS: Gutenberg blocks detected.");
} else {
    console.log("\n❌ FAILED: Gutenberg blocks missing.");
}
