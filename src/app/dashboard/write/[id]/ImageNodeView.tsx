import React, { useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { useParams } from 'next/navigation';
import { RefreshCw, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

export const ImageNodeView = (props: any) => {
    const { node, updateAttributes, editor, getPos } = props;
    const params = useParams();
    const jobId = params?.id as string;

    const [isHovered, setIsHovered] = useState(false);
    const [showButton, setShowButton] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowButton(true);
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        setShowButton(false);
        try {
            // Find the closest figure HTML for full context (if any)
            let html = `<img src="${node.attrs.src}" alt="${node.attrs.alt || ''}" title="${node.attrs.title || ''}" class="${node.attrs.class || ''}">`;
            
            // Attempt to get the HTML of the parent Figure block if it exists
            const resolvedPos = editor.state.doc.resolve(getPos());
            const parentNode = resolvedPos.parent;
            if (parentNode.type.name === 'figure') {
                // Not perfectly straightforward to get outerHTML via API, so we send basic img
                // But wait, the API Route is meant to process Figure HTML. 
                // Let's get the DOM node:
                const domNode = editor.view.nodeDOM(getPos()) as HTMLElement | null;
                if (domNode && domNode.closest('figure')) {
                    html = domNode.closest('figure')!.outerHTML;
                }
            }

            // Call jobs queue API
            const res = await fetch('/api/images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, html })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to queue job');
            }

            const { job } = await res.json();
            toast.info('Image generation started. Please wait...');

            // Poll for result
            const pollInterval = setInterval(async () => {
                const statusRes = await fetch(`/api/images/generate?id=${job.id}`);
                const statusData = await statusRes.json();
                
                if (statusData.job.status === 'completed') {
                    clearInterval(pollInterval);
                    const newUrl = statusData.job.payload.publicUrl;
                    
                    // Update image src
                    updateAttributes({ src: newUrl });
                    setIsGenerating(false);
                    toast.success('New image created!', { 
                        description: 'Important: Remember to click "Save Edits" above to keep this change!',
                        duration: 8000
                    });
                } else if (statusData.job.status === 'failed') {
                    clearInterval(pollInterval);
                    setIsGenerating(false);
                    toast.error('Image generation failed.');
                }
            }, 5000);

        } catch (error: any) {
            console.error(error);
            toast.error(error.message);
            setIsGenerating(false);
        }
    };

    return (
        <NodeViewWrapper 
            className="relative inline-block w-full max-w-full group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onDoubleClick={handleDoubleClick}
        >
            <div className="relative inline-block w-full text-center">
                <img 
                    src={node.attrs.src} 
                    alt={node.attrs.alt} 
                    title={node.attrs.title}
                    className={`${node.attrs.class || ''} transition-opacity duration-300 ${isGenerating ? 'opacity-50 blur-sm' : ''}`}
                />
                
                {/* Tooltip on Hover */}
                {isHovered && !showButton && !isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl pointer-events-none">
                        <span className="bg-black/80 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            Double click to create new image
                        </span>
                    </div>
                )}

                {/* Create Now Button (After Double Click) */}
                {showButton && !isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/60 rounded-3xl z-10 backdrop-blur-sm">
                        <button 
                            onClick={handleGenerate}
                            className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transform transition-transform hover:scale-105 shadow-xl"
                        >
                            <RefreshCw className="w-5 h-5" />
                            Create New Image
                        </button>
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowButton(false); }}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transform transition-transform hover:scale-105 shadow-xl border border-zinc-600"
                        >
                            <X className="w-5 h-5" />
                            Cancel
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {isGenerating && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-3xl z-10 backdrop-blur-sm">
                        <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
                        <span className="text-white font-medium text-sm animate-pulse">Generating New Image...</span>
                    </div>
                )}
            </div>
        </NodeViewWrapper>
    );
};
