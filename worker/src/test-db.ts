import { SupabaseService } from './services/supabase.service';

async function testUpdate() {
    const supabase = SupabaseService.getClient();
    // get a writing job
    const { data: job } = await supabase.from('writing_jobs').select('id').limit(1).single();
    if (!job) return console.log("no job");
    
    console.log("Found job:", job.id);
    
    const { error } = await supabase
        .from('writing_jobs')
        .update({
            status: 'failed',
            generation_status: 'failed',
            error_message: "Test failure message"
        })
        .eq('id', job.id);
        
    if (error) {
        console.error("DB Update failed!", error);
    } else {
        console.log("DB Update successful!");
    }
}

testUpdate();
