import {
  Lightbulb, Code, Dumbbell, Apple, Brain, Rocket, BookOpen, Sparkles, Heart, Briefcase, Target,
  Music, Camera, Plane, House, Leaf, Coffee, Palette, Bot, Cpu, Flame, Star, Globe, Wallet,
  GraduationCap, Gamepad2, Salad, Bug, Wrench, PenLine, Film, Car, Users, MessageCircle,
  ShoppingCart, Mountain, Bike, Stethoscope, Calculator, Zap, Smartphone, Database, Terminal,
  Newspaper, Map, Gift, Trophy, Feather, Smile, Shield, Atom, FlaskConical, Languages,
  Headphones, Dog, Sprout, Calendar, FileText, Library,
} from 'lucide-react'

// Topic icons, keyed by the value stored in nx_topics.icon.
export const TOPIC_ICONS = {
  lightbulb: Lightbulb, sparkles: Sparkles, rocket: Rocket, target: Target, brain: Brain,
  code: Code, terminal: Terminal, bot: Bot, cpu: Cpu, database: Database, smartphone: Smartphone, bug: Bug,
  dumbbell: Dumbbell, apple: Apple, salad: Salad, flame: Flame, bike: Bike, heart: Heart, stethoscope: Stethoscope,
  book: BookOpen, library: Library, graduation: GraduationCap, languages: Languages, pen: PenLine, feather: Feather, file: FileText, newspaper: Newspaper,
  briefcase: Briefcase, wallet: Wallet, calculator: Calculator, calendar: Calendar, wrench: Wrench, zap: Zap, shield: Shield,
  atom: Atom, flask: FlaskConical, globe: Globe, map: Map, plane: Plane, mountain: Mountain, leaf: Leaf, sprout: Sprout,
  house: House, users: Users, message: MessageCircle, smile: Smile, dog: Dog, gift: Gift, cart: ShoppingCart, car: Car,
  music: Music, headphones: Headphones, film: Film, camera: Camera, palette: Palette, gamepad: Gamepad2, coffee: Coffee,
  trophy: Trophy, star: Star,
}

export const ICON_KEYS = Object.keys(TOPIC_ICONS)

export function topicIcon(key) {
  return TOPIC_ICONS[key] || Lightbulb
}

// Guess a fitting icon from a new topic's name, so creating a topic rarely needs extra taps.
const HINTS = [
  [/כושר|אימונ|חדר כושר|fitness|gym|workout/i, 'dumbbell'],
  [/קלורי|תזונ|אוכל|מתכונ|food|nutrition|diet/i, 'salad'],
  [/תכנות|קוד|code|dev|programming|פיתוח/i, 'code'],
  [/ai|בינה|gpt|claude|llm|מודל/i, 'bot'],
  [/אתר|web|site|אפליקצי|app/i, 'smartphone'],
  [/התפתחות|אישי|הרגל|personal|growth|habit/i, 'sprout'],
  [/ספר|קריאה|book|read/i, 'book'],
  [/לימוד|קורס|למידה|study|course|learn/i, 'graduation'],
  [/כסף|כספ|השקע|finance|money|invest/i, 'wallet'],
  [/עבודה|work|job|קריירה|career/i, 'briefcase'],
  [/טיול|נסיע|travel|trip/i, 'plane'],
  [/מוזיק|שיר|music/i, 'music'],
  [/בריאות|health|רפוא/i, 'heart'],
  [/רעיונ|idea/i, 'lightbulb'],
  [/בית|home|house/i, 'house'],
  [/משפח|חברים|family|friends/i, 'users'],
  [/מטר|goal|יעד/i, 'target'],
  [/באג|bug/i, 'bug'],
  [/סרט|סדר|movie|film|series/i, 'film'],
  [/צילום|photo/i, 'camera'],
  [/עיצוב|design|art|אומנות/i, 'palette'],
  [/מדע|science|פיזיק/i, 'atom'],
  [/משחק|game/i, 'gamepad'],
  [/קפה|coffee/i, 'coffee'],
]

export function guessIcon(name) {
  for (const [re, key] of HINTS) if (re.test(name)) return key
  return null
}
