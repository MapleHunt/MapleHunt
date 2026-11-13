import { useNavigate, useSearchParams } from "react-router";
import { useToast } from "../../components/useToast";
import { MobileHeader } from "../../layout/MobileShell";
import { HarvestForm } from "../shared/HarvestForm";
import "./mobile-screens.css";

// Figma "05 Log Harvest". /log?edit=<id> edits an existing harvest.

export function LogHarvestScreen() {
  const [params] = useSearchParams();
  const editId = params.get("edit");
  const navigate = useNavigate();
  const { show, toast } = useToast();

  return (
    <>
      <MobileHeader
        kicker="MAPLEHUNT / FIELD RECORD"
        title={editId ? "Edit harvest" : "Log harvest"}
        action={{ icon: "m4-x-white.svg", label: "Close", to: editId ? "/more" : "/map" }}
      />
      <div className="m-body ml">
        <HarvestForm
          key={editId ?? "new"}
          editId={editId}
          onSaved={(msg) => {
            show(msg);
            if (editId) navigate("/more");
          }}
        />
      </div>
      {toast}
    </>
  );
}
