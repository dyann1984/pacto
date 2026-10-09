import Image from "next/image";
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand ${large ? "brand-large" : ""}`}>
      <Image
        src="/pacto-mark.svg"
        width={large ? 82 : 36}
        height={large ? 98 : 43}
        alt="Símbolo PACTO: monograma metálico con acuerdo y arquitectura"
      />
      <span>PACTO</span>
    </span>
  );
}
