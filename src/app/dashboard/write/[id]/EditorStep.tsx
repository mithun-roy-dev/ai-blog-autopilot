"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useEditor, EditorContent, Node } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import TurndownService from "turndown"
import { marked } from "marked"
import {
    Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon,
    Heading1, Heading2, Heading3, List, ListOrdered, Quote,
    Minus, Image as ImageIcon, Undo, Redo, AlignLeft, AlignCenter,
    AlignRight, Save, Eye, Code, Trash2, Maximize2, Minimize2, Edit, Link2Off
} from "lucide-react"
import { cn } from "@/utils/cn"

interface EditorStepProps {
    initialContent: string
    onSave: (content: string) => Promise<void>
    isSaving: boolean
}

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
})

// Ensure figure and figcaption are preserved as HTML in markdown output
turndownService.keep(['figure', 'figcaption', 'img'])

// Preserve underline (u tags)
turndownService.addRule('underline', {
    filter: ['u'],
    replacement: (content) => `<u>${content}</u>`
})

// Preserve text alignment (inline styles)
turndownService.addRule('align', {
    filter: (node) => {
        return (node.nodeName === 'P' || /^H[1-6]$/.test(node.nodeName)) && 
               (node.style.textAlign)
    },
    replacement: (content, node) => {
        const tag = node.nodeName.toLocaleLowerCase()
        const align = node.style.textAlign
        return `<${tag} style="text-align: ${align}">${content}</${tag}>`
    }
})

// Custom Figure and Figcaption extensions for Tiptap
const Figure = Node.create({
    name: 'figure',
    group: 'block',
    content: 'block+',
    draggable: true,
    parseHTML() {
        return [{ tag: 'figure' }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['figure', HTMLAttributes, 0]
    },
})

const Figcaption = Node.create({
    name: 'figcaption',
    group: 'block',
    content: 'inline*',
    parseHTML() {
        return [{ tag: 'figcaption' }]
    },
    renderHTML({ HTMLAttributes }) {
        return ['figcaption', HTMLAttributes, 0]
    },
})


// Helper to remove horizontal rules and clean up spacing
const cleanupContent = (content: string) => {
    if (!content) return ''
    return content
        .replace(/^\s*([-*_]){3,}\s*$/gm, '') // Remove --- or *** lines
        .replace(/\n{3,}/g, '\n\n')            // Normalize multiple newlines
        .trim()
}

export default function EditorStep({ initialContent, onSave, isSaving }: EditorStepProps) {
    const [view, setView] = useState<'formatted' | 'markdown'>('formatted')
    
    // Process initial content only once on mount
    const processedInitialContent = useMemo(() => {
        return cleanupContent(initialContent)
    }, [initialContent])

    const [markdownContent, setMarkdownContent] = useState(processedInitialContent)
    const [isMaximized, setIsMaximized] = useState(false)

    // Parse markdown to HTML for initial content
    const initialHtml = useMemo(() => {
        return marked.parse(processedInitialContent)
    }, [processedInitialContent])

    const editor = useEditor({
        extensions: [
            StarterKit,
            Figure,
            Figcaption,
            Underline,
            Link.configure({
                openOnClick: false,
                autolink: true,
                defaultProtocol: 'https',
                HTMLAttributes: {
                    class: 'text-primary underline cursor-pointer'
                }
            }),
            Image.configure({
                HTMLAttributes: {
                    class: 'rounded-2xl border border-border/50 shadow-sm max-w-full'
                }
            }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
        ],
        content: initialHtml as string,
        editorProps: {
            handleClick: (view, pos, event) => {
                const target = (event.target as HTMLElement).closest('a')
                if (target) {
                    event.preventDefault()
                    event.stopPropagation()
                    return true
                }
                return false
            },
            handleDoubleClick: (view, pos, event) => {
                const target = (event.target as HTMLElement).closest('a')
                if (target) {
                    const href = target.getAttribute('href')
                    if (href) {
                        window.open(href, '_blank')
                        return true
                    }
                }
                return false
            },
            attributes: {
                class: 'prose prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[600px] p-8 sm:p-12 text-foreground leading-relaxed prose-h1:text-4xl prose-h1:font-black prose-h1:mb-6 prose-h1:pb-0 prose-h1:border-none prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-0 prose-h2:border-none prose-p:mb-5 prose-p:leading-relaxed prose-img:rounded-3xl prose-img:shadow-2xl prose-img:mx-auto prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-muted-foreground prose-figcaption:mt-3 prose-figcaption:mb-10 hover:prose-a:text-primary transition-all prose-a:text-blue-600 prose-a:font-bold prose-a:no-underline hover:prose-a:underline',
            },
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML()
            const md = turndownService.turndown(html)
            setMarkdownContent(md)
        },
        immediatelyRender: false,
    }, [initialContent])

    // Sync markdown to editor if viewed and changed
    const handleMarkdownChange = (val: string) => {
        setMarkdownContent(val)
        // Note: we don't immediately sync to Tiptap to avoid cursor jumping, 
        // usually we sync on switch or save.
    }

    const switchView = () => {
        const newView = view === 'formatted' ? 'markdown' : 'formatted'
        
        if (newView === 'formatted') {
            // Sync MD back to Tiptap
            const html = marked.parse(markdownContent)
            editor?.commands.setContent(html as string)
        } else {
            // Sync Tiptap back to MD
            const html = editor?.getHTML() || ''
            const md = turndownService.turndown(html)
            setMarkdownContent(md)
        }
        
        setView(newView)
    }

    const handleSaveClick = async () => {
        // Use the most current content based on view
        let finalContent = markdownContent
        if (view === 'formatted' && editor) {
            finalContent = turndownService.turndown(editor.getHTML())
        }
        await onSave(finalContent)
    }

    if (!editor) return null

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {/* View Switcher & Actions */}
            <div className="flex items-center justify-between border-b pb-4 border-border/50">
                <button
                    onClick={switchView}
                    className="flex items-center gap-2 px-5 py-2.5 bg-accent/30 hover:bg-accent/50 rounded-xl border border-border/50 shadow-sm text-xs font-black uppercase tracking-widest transition-all text-foreground"
                >
                    {view === 'formatted' ? <Code className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
                    {view === 'formatted' ? 'Switch to Markdown' : 'Switch to Formatted'}
                </button>

                <div className="flex items-center gap-2 sm:gap-3">
                    <button
                        onClick={() => setIsMaximized(!isMaximized)}
                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center justify-center title='Toggle full screen'"
                    >
                        {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={handleSaveClick}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-black rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-[10px] disabled:opacity-50"
                    >
                        {isSaving ? <Trash2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save Edits
                    </button>
                </div>
            </div>

            {/* Maximized Overlay */}
            {isMaximized && (
                <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-5xl h-full shadow-2xl rounded-[2.5rem] flex flex-col overflow-hidden border border-border/50 animate-in zoom-in-95 duration-300">
                        <div className="p-6 sm:p-8 border-b border-border/50 bg-card/60 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                                    <Edit className="h-6 w-6 text-primary" />
                                </div>
                                <button
                                    onClick={switchView}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-accent/30 hover:bg-accent/50 rounded-xl border border-border/50 shadow-sm text-[10px] font-black uppercase tracking-widest transition-all text-foreground"
                                >
                                    {view === 'formatted' ? <Code className="h-3.5 w-3.5 text-primary" /> : <Eye className="h-3.5 w-3.5 text-primary" />}
                                    {view === 'formatted' ? 'Switch to Markdown' : 'Switch to Formatted'}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3">
                                <button
                                    onClick={handleSaveClick}
                                    disabled={isSaving}
                                    className="p-3 sm:px-5 sm:py-3 rounded-2xl bg-primary text-white font-black hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest"
                                >
                                    <Save className="h-4 sm:h-5 w-4 sm:w-5" />
                                    <span className="hidden sm:inline">Save Edits</span>
                                </button>
                                <button
                                    onClick={() => setIsMaximized(false)}
                                    className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all shadow-sm flex items-center justify-center title='Minimize view'"
                                >
                                    <Minimize2 className="h-4 sm:h-5 w-4 sm:w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Toolbar in maximized mode */}
                        {view === 'formatted' && (
                            <div className="px-8 py-4 bg-secondary/10 border-b border-border/40 flex flex-wrap items-center gap-1.5 overflow-x-auto scrollbar-hide">
                                <div className="flex items-center gap-1.5">
                                    <MenuButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={Bold} title="Bold" />
                                    <MenuButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={Italic} title="Italic" />
                                    <MenuButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} icon={UnderlineIcon} title="Underline" />
                                </div>
                                <div className="w-px h-6 bg-border/50 mx-1" />
                                <div className="flex items-center gap-1.5">
                                    <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={Heading2} title="Heading 2" />
                                    <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} icon={Heading3} title="Heading 3" />
                                </div>
                                <div className="w-px h-6 bg-border/50 mx-1" />
                                <div className="flex items-center gap-1.5">
                                    <MenuButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={List} title="Bullet List" />
                                    <MenuButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={ListOrdered} title="Ordered List" />
                                </div>
                                <div className="w-px h-6 bg-border/50 mx-1" />
                                <div className="flex items-center gap-1.5">
                                    <MenuButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} icon={Quote} title="Blockquote" />
                                    <MenuButton onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} icon={Minus} title="Horizontal Rule" />
                                </div>
                                <div className="w-px h-6 bg-border/50 mx-1" />
                                <div className="flex items-center gap-1.5">
                                    <MenuButton onClick={() => { const url = window.prompt('URL'); if (url) editor.chain().focus().setLink({ href: url }).run() }} active={editor.isActive('link')} icon={LinkIcon} title="Add Link" />
                                    <MenuButton onClick={() => editor.chain().focus().unsetLink().run()} active={false} icon={Link2Off} title="Remove Link" disabled={!editor.isActive('link')} />
                                    <MenuButton onClick={() => { const url = window.prompt('Image URL'); if (url) editor.chain().focus().setImage({ src: url }).run() }} active={false} icon={ImageIcon} title="Add Image" />
                                </div>
                                <div className="ml-auto flex items-center gap-1.5">
                                    <MenuButton onClick={() => editor.chain().focus().undo().run()} active={false} icon={Undo} title="Undo" disabled={!editor.can().undo()} />
                                    <MenuButton onClick={() => editor.chain().focus().redo().run()} active={false} icon={Redo} title="Redo" disabled={!editor.can().redo()} />
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto bg-card">
                            <div className="max-w-[800px] mx-auto py-12 px-6">
                                {view === 'formatted' ? (
                                    <EditorContent editor={editor} />
                                ) : (
                                    <textarea
                                        value={markdownContent}
                                        onChange={(e) => handleMarkdownChange(e.target.value)}
                                        className="w-full h-full min-h-[600px] bg-transparent text-foreground font-mono text-base leading-relaxed focus:outline-none resize-none"
                                        placeholder="Paste your markdown here..."
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Toolbar (Only for formatted view) */}
            {view === 'formatted' && (
                <div className="flex flex-wrap items-center gap-1.5 p-3 bg-secondary/20 rounded-2xl border border-border/40 shadow-sm sticky top-0 z-20 backdrop-blur-md">
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        active={editor.isActive('bold')}
                        icon={Bold}
                        title="Bold"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        active={editor.isActive('italic')}
                        icon={Italic}
                        title="Italic"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        active={editor.isActive('underline')}
                        icon={UnderlineIcon}
                        title="Underline"
                    />
                    <div className="w-px h-6 bg-border/50 mx-1" />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        active={editor.isActive('heading', { level: 2 })}
                        icon={Heading2}
                        title="Heading 2"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        active={editor.isActive('heading', { level: 3 })}
                        icon={Heading3}
                        title="Heading 3"
                    />
                    <div className="w-px h-6 bg-border/50 mx-1" />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        active={editor.isActive('bulletList')}
                        icon={List}
                        title="Bullet List"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        active={editor.isActive('orderedList')}
                        icon={ListOrdered}
                        title="Ordered List"
                    />
                    <div className="w-px h-6 bg-border/50 mx-1" />
                    <MenuButton
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        active={editor.isActive('blockquote')}
                        icon={Quote}
                        title="Blockquote"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        active={false}
                        icon={Minus}
                        title="Horizontal Rule"
                    />
                    <div className="w-px h-6 bg-border/50 mx-1" />
                    <MenuButton
                        onClick={() => {
                            const url = window.prompt('URL')
                            if (url) editor.chain().focus().setLink({ href: url }).run()
                        }}
                        active={editor.isActive('link')}
                        icon={LinkIcon}
                        title="Add Link"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().unsetLink().run()}
                        active={false}
                        icon={Link2Off}
                        title="Remove Link"
                        disabled={!editor.isActive('link')}
                    />
                    <MenuButton
                        onClick={() => {
                            const url = window.prompt('Image URL')
                            if (url) editor.chain().focus().setImage({ src: url }).run()
                        }}
                        active={false}
                        icon={ImageIcon}
                        title="Add Image"
                    />
                    <div className="w-px h-6 bg-border/50 mx-1" />
                    <MenuButton
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        active={editor.isActive({ textAlign: 'left' })}
                        icon={AlignLeft}
                        title="Align Left"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        active={editor.isActive({ textAlign: 'center' })}
                        icon={AlignCenter}
                        title="Align Center"
                    />
                    <MenuButton
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        active={editor.isActive({ textAlign: 'right' })}
                        icon={AlignRight}
                        title="Align Right"
                    />
                    <div className="ml-auto flex items-center gap-1.5">
                        <MenuButton
                            onClick={() => editor.chain().focus().undo().run()}
                            active={false}
                            icon={Undo}
                            title="Undo"
                            disabled={!editor.can().undo()}
                        />
                        <MenuButton
                            onClick={() => editor.chain().focus().redo().run()}
                            active={false}
                            icon={Redo}
                            title="Redo"
                            disabled={!editor.can().redo()}
                        />
                    </div>
                </div>
            )}

            {/* Editor Area */}
            <div className="bg-background rounded-3xl border border-border/50 overflow-hidden shadow-sm h-[700px] flex flex-col">
                <div className="flex-1 overflow-y-auto relative scroll-smooth custom-scrollbar">
                    {(view === 'formatted' && !isMaximized) && (
                        <EditorContent editor={editor} />
                    )}
                    {(view === 'markdown' && !isMaximized) && (
                        <textarea
                            value={markdownContent}
                            onChange={(e) => handleMarkdownChange(e.target.value)}
                            className="w-full h-full p-8 bg-card/10 text-foreground font-mono text-sm leading-relaxed focus:outline-none resize-none"
                            placeholder="Paste your markdown here..."
                        />
                    )}
                </div>
            </div>

            {/* Editor Stats */}
            <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-4">
                <span>Words: <span className="text-primary">{markdownContent.trim().split(/\s+/).length}</span></span>
                <span>Characters: <span className="text-primary">{markdownContent.length}</span></span>
                {view === 'markdown' && <span className="ml-auto text-amber-500 animate-pulse">Sync pending switch to formatted view</span>}
            </div>
        </div>
    )
}

function MenuButton({ onClick, active, icon: Icon, title, disabled = false }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={cn(
                "p-2.5 rounded-xl transition-all",
                active ? "bg-primary text-white shadow-md shadow-primary/20 scale-105" : "text-muted-foreground hover:bg-background hover:text-foreground",
                disabled ? "opacity-30 cursor-not-allowed scale-100" : ""
            )}
        >
            <Icon className="h-4 w-4" />
        </button>
    )
}
