import { useStore, dismissToast } from '../store'

export default function Toast() {
  const { toast } = useStore()
  return (
    <div className="toast-wrap" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                dismissToast()
                toast.action.run()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
