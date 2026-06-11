import { AuthGate } from "../components/AuthGate";
import { RegisterServiceWorker } from "../components/RegisterServiceWorker";

export default function Home() {
  return (
    <>
      <AuthGate />
      <RegisterServiceWorker />
    </>
  );
}
