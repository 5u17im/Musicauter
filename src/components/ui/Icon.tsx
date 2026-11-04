import type { CSSProperties } from "react";
import { Icon as IconifyIcon, type IconProps as IconifyProps } from "@iconify/react";
import "./core-icons";

export interface IconProps extends Omit<IconifyProps, "icon" | "width" | "height"> {
  /**
   * Identificador vectorial del icono en el catálogo de Yesicon.app (colección Solar).
   * Ejemplos: "solar:play-bold", "solar:pause-bold", "solar:download-square-bold"
   */
  icon: string;
  /** Tamaño en píxeles o cadena CSS (aplica a ancho y alto si no se indican por separado). */
  size?: number | string;
  width?: number | string;
  height?: number | string;
  className?: string;
  color?: string;
  inline?: boolean;
  style?: CSSProperties;
}

/**
 * Componente unificado de iconografía vectorial para Audionave.
 * Basado en el catálogo de diseño de Yesicon.app mediante @iconify/react
 * con bundle local (0ms de latencia y funcionamiento 100% offline).
 */
export function Icon({
  icon,
  size = 18,
  width,
  height,
  className = "",
  color,
  inline = false,
  style,
  ...props
}: IconProps) {
  const finalWidth = width ?? size;
  const finalHeight = height ?? size;

  return (
    <IconifyIcon
      icon={icon}
      width={finalWidth}
      height={finalHeight}
      inline={inline}
      className={className}
      style={{
        color,
        flexShrink: 0,
        display: inline ? "inline-block" : undefined,
        verticalAlign: inline ? "middle" : undefined,
        ...style,
      }}
      {...props}
    />
  );
}

export default Icon;

