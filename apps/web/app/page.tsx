import { Dashboard } from "../components/dashboard";

const defaultFarmId = process.env.NEXT_PUBLIC_DEFAULT_FARM_ID ?? "FARM_001";

export default function HomePage() {
  return <Dashboard defaultFarmId={defaultFarmId} />;
}
