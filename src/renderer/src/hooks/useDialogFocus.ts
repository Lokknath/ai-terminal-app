import { RefObject, useEffect, useRef } from 'react'

const focusable =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

// Keep keyboard navigation inside a modal and return focus to its trigger.
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const target = ref.current?.querySelector<HTMLElement>(focusable)
      target?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent): void => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== ref.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      }
      if (event.key !== 'Tab' || !ref.current) return
      const elements = Array.from(ref.current.querySelectorAll<HTMLElement>(focusable))
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!ref.current.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      previous?.focus()
    }
  }, [ref])
}
