import { useEffect, useState } from 'react'

export default function useScrolled(threshold = 10) {
  const [scrolled, setScrolled] = useState(() => window.scrollY > threshold)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold)
    window.addEventListener('scroll', on, { passive: true })
    on()
    return () => window.removeEventListener('scroll', on)
  }, [threshold])
  return scrolled
}
