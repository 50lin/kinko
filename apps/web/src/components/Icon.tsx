import {
  Activity, AudioLines, BatteryCharging, BedDouble, Bike, BookOpen, Brain, Briefcase, CalendarCheck, Camera, ChefHat, Circle, Clapperboard, ClipboardList, CloudSun, Code, Crown,
  Dice5, Drama, Dribbble, Droplets, Dumbbell, Flower2, Footprints, Gamepad2, Gauge, GlassWater, GraduationCap, Guitar, Hand, Headphones, Heart, HeartHandshake, HeartPulse,
  Languages, ListTree, MessagesSquare, Mic, Moon, Mountain, Music, NotebookPen, Palette, PartyPopper, PawPrint, PenTool, Pencil, Play, Puzzle, Scale, ScanLine, ScanSearch,
  Scissors, Shield, Sparkles, Sprout, Square, Stethoscope, Sunrise, Swords, Thermometer, TriangleAlert, Trophy, Users, Waves, Wind, Zap, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  Activity, AudioLines, BatteryCharging, BedDouble, Bike, BookOpen, Brain, Briefcase, CalendarCheck, Camera, ChefHat, Circle, Clapperboard, ClipboardList, CloudSun, Code, Crown,
  Dice5, Drama, Dribbble, Droplets, Dumbbell, Flower2, Footprints, Gamepad2, Gauge, GlassWater, GraduationCap, Guitar, Hand, Headphones, Heart, HeartHandshake, HeartPulse,
  Languages, ListTree, MessagesSquare, Mic, Moon, Mountain, Music, NotebookPen, Palette, PartyPopper, PawPrint, PenTool, Pencil, Play, Puzzle, Scale, ScanLine, ScanSearch,
  Scissors, Shield, Sparkles, Sprout, Square, Stethoscope, Sunrise, Swords, Thermometer, TriangleAlert, Trophy, Users, Waves, Wind, Zap,
};
export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.8 }: { name?: string; className?: string; strokeWidth?: number }) {
  const C = (name && MAP[name]) || Sparkles;
  return <C className={className} strokeWidth={strokeWidth} />;
}
/** Portada generada (sin imágenes externas): degradado con icono. */
export function Cover({ hue = 165, icon, className = '', size = 'h-10 w-10' }: { hue?: number; icon?: string; className?: string; size?: string }) {
  return (
    <div className={`relative grid place-items-center overflow-hidden ${className}`} style={{ background: `radial-gradient(120% 120% at 20% 10%, hsl(${hue} 70% 82%), hsl(${(hue + 25) % 360} 45% 55%) 55%, hsl(${(hue + 40) % 360} 45% 28%))` }}>
      <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(60% 60% at 80% 90%, rgba(255,255,255,.6), transparent 60%)' }} />
      <Icon name={icon} className={`${size} relative text-white/90 drop-shadow`} strokeWidth={1.5} />
    </div>
  );
}
