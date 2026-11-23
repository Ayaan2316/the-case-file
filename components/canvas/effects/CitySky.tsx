"use client";

import { useKTX2 } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { EquirectangularReflectionMapping, type Texture } from "three";

/** sky.py stores the HDRI's linear values divided by this (8 bit, sRGB) */
const SKY_RANGE = 8;
/**
 * how bright the city looks through the window. cycles sees it through refractive glass,
 * not as a camera ray, so 0.22 like the world strength in lighting.py
 */
export const SKY_INTENSITY = 0.22 * SKY_RANGE;

/**
 * night city behind the window - poly haven's Modern Buildings Night as a KTX2 background.
 * reflections don't use it, those come from RoomProbe
 */
export default function CitySky() {
  const sky = useKTX2("/hdri/city_night_sky.ktx2", "/basis/") as unknown as Texture;
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    sky.mapping = EquirectangularReflectionMapping;
    scene.background = sky;
    scene.backgroundIntensity = SKY_INTENSITY;
    scene.backgroundRotation.set(0, Math.PI * 0.62, 0);
    return () => {
      scene.background = null;
    };
  }, [scene, sky]);
  return null;
}
