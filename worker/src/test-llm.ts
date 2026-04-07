import { LLMService } from './services/llm.service';
import { Logger } from './utils/logger';

async function test() {
    console.log('Testing LLMService.resolveTask("content_brief")...');
    try {
        const resolved = await LLMService.resolveTask('content_brief');
        console.log('Resolved:', resolved);
    } catch (err: any) {
        console.error('Test failed:', err.message);
    }
}

test().then(() => console.log('Done.'));
