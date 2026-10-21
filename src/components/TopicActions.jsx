import { useCallback, useState } from 'react'
import { Pin, PinOff, Pencil, Trash2 } from 'lucide-react'
import Menu, { Confirm } from './Menu'
import { useStore, updateTopic, deleteTopic } from '../store'
import { openTopicEditor } from '../ui'
import { countLabel } from '../lib/format'

// Topic actions shared by home tiles, the topics list and the topic screen.
export default function useTopicActions(topic, { onDeleted } = {}) {
  const { items } = useStore()
  const [anchor, setAnchor] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const close = useCallback(() => setAnchor(null), [])

  const open = (e) => {
    e.stopPropagation()
    e.preventDefault()
    setAnchor(e.currentTarget.getBoundingClientRect())
  }
  if (!topic) return { open, elements: null }

  const count = confirm ? items.filter((i) => i.topic_id === topic.id).length : 0
  const actions = [
    { label: 'עריכת שם, סמל וצבע', icon: Pencil, run: () => openTopicEditor({ topic }) },
    topic.pinned
      ? { label: 'בטל נעיצה בבית', icon: PinOff, run: () => updateTopic(topic.id, { pinned: false }) }
      : { label: 'נעץ בראש הבית', icon: Pin, run: () => updateTopic(topic.id, { pinned: true }) },
    { divider: true, key: 'sep' },
    { label: 'מחיקת נושא', icon: Trash2, danger: true, run: () => setConfirm(true) },
  ]

  const elements = (
    <>
      <Menu anchor={anchor} onClose={close} title={topic.name} actions={actions} />
      <Confirm
        open={confirm}
        title={`למחוק את ״${topic.name}״?`}
        body={count ? `${countLabel(count)} יימחקו לצמיתות יחד עם הנושא. אפשר לייצא גיבוי בהגדרות.` : 'הנושא ריק ויימחק.'}
        confirmLabel="מחק"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          onDeleted?.()
          deleteTopic(topic.id)
        }}
      />
    </>
  )
  return { open, elements }
}
