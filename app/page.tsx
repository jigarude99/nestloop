import { NestLoopApp } from "../components/NestLoopApp";
import { RegisterServiceWorker } from "../components/RegisterServiceWorker";

export default function Home() {
  return (
    <>
      <NestLoopApp />
      <RegisterServiceWorker />
    </>
  );
}
