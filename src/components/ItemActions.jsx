import { useCallback, useState } from 'react'
import { Pin, PinOff, Pencil, FolderInput, Trash2, Copy } from 'lucide-react'
import Menu, { Confirm } from './Menu'
import MoveSheet from './MoveSheet'
import { useStore, updateItem, deleteItem, toast } from '../store'
import { navigate } from '../router'
import { itemTitle } from '../lib/format'

// Everything you can do to an item, shared by list rows and the item screen.
// Returns an `open(event)` to call from a "⋯" button and the elements to render.
export default function useItemActions(item, { onEdit, onBeforeChange, onDeleted } = {}) {
  const { topics } = useStore()
  const [anchor, setAnchor] = useState(null)
  const [moving, setMoving] = useState(false)
  const [moveMounted, setMoveMounted] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const close = useCallback(() => setAnchor(null), [])

  const open = (e) => {
    e.stopPropagation()
    e.preventDefault()
    setMoveMounted(true)
    setAnchor(e.currentTarget.getBoundingClientRect())
  }

  const startMove = () => {
    setMoveMounted(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setMoving(true)))
  }

  if (!item) return { open, startMove, elements: null }

  const actions = [
    { label: 'עריכה', icon: Pencil, run: () => (onEdit ? onEdit() : navigate(`/i/${item.id}/edit`)) },
    item.pinned
      ? { label: 'בטל נעיצה', icon: PinOff, run: () => updateItem(item.id, { pinned: false }) }
      : { label: 'נעץ בראש הנושא', icon: Pin, run: () => updateItem(item.id, { pinned: true }) },
    { label: 'העבר לנושא…', icon: FolderInput, run: startMove },
    {
      label: 'העתק טקסט',
      icon: Copy,
      run: () => {
        const text = [item.title, item.content].filter((s) => s?.trim()).join('\n\n')
        navigator.clipboard?.writeText(text).then(
          () => toast('הועתק'),
          () => toast('לא ניתן להעתיק'),
        )
      },
    },
    { divider: true, key: 'sep' },
    { label: 'מחיקה', icon: Trash2, danger: true, run: () => setConfirm(true) },
  ]

  const elements = (
    <>
      <Menu anchor={anchor} onClose={close} title={itemTitle(item)} actions={actions} />
      {moveMounted && (
        <MoveSheet
          open={moving}
          onClose={() => setMoving(false)}
          currentId={item.topic_id}
          onPick={(tid) => {
            setMoving(false)
            if (tid === item.topic_id) return
            onBeforeChange?.()
            updateItem(item.id, { topic_id: tid })
            const t = topics.find((x) => x.id === tid)
            toast(`הועבר ל״${t?.name}״`)
          }}
        />
      )}
      <Confirm
        open={confirm}
        title="למחוק את הפריט?"
        body={`״${itemTitle(item)}״ יימחק. אפשר לבטל בשניות הראשונות.`}
        confirmLabel="מחק"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          onDeleted?.()
          deleteItem(item.id)
        }}
      />
    </>
  )
  return { open, startMove, elements }
}
