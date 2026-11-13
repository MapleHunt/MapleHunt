import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Enums } from "@maplehunt/shared";
import { Button, Field, Icon, Segmented } from "../../components/ui";
import { db } from "../../data/db";
import { DEFAULT_CENTER, useGeo } from "../../data/geo";
import { localDate, useActiveHunt } from "../../data/hunt";
import { useParty } from "../../data/party";
import { formatPoint, parsePointText, saveRecord, toPointText } from "../../data/records";
import type { Point } from "../../data/records";
import { SPECIES } from "../../data/useRecords";
import { RealMap } from "../../map/RealMap";
import "./harvest-form.css";

// Figma "05 Log Harvest". Saves to the phone first (works with no signal), then syncs.

const sexes = ["Male", "Female"] as const;
const ages = ["Adult", "Yearling", "Young"] as const;
const methods = ["Gun", "Bow", "Muzzleloader"] as const;
const lower = <T extends string>(s: string) => s.toLowerCase() as T;
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function timeNow(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Props {
  /** Edit this harvest instead of logging a new one. */
  editId?: string | null;
  onSaved?: (message: string) => void;
}

export function HarvestForm({ editId, onSaved }: Props) {
  const { position, here, overlay, checkAt } = useGeo();
  const { party } = useParty();
  const hunt = useActiveHunt();

  const [species, setSpecies] = useState<Enums<"species_t">>(party?.species ?? "deer");
  const [sex, setSex] = useState<(typeof sexes)[number]>("Male");
  const [age, setAge] = useState<(typeof ages)[number]>("Adult");
  const [method, setMethod] = useState<(typeof methods)[number]>("Gun");
  const [date, setDate] = useState(localDate());
  const [time, setTime] = useState(timeNow());
  const [point, setPoint] = useState<Point | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [tag, setTag] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [huntDayId, setHuntDayId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const loadedEdit = useRef<string | null>(null);

  // Editing: load the record once.
  useEffect(() => {
    if (!editId || loadedEdit.current === editId) return;
    loadedEdit.current = editId;
    void db.harvest_records.get(editId).then((r) => {
      if (!r) return;
      const at = new Date(r.harvested_at);
      setSpecies(r.species);
      setSex(title(r.sex) as (typeof sexes)[number]);
      setAge(title(r.age_class) as (typeof ages)[number]);
      setMethod(title(r.method) as (typeof methods)[number]);
      setDate(localDate(at));
      setTime(timeNow(at));
      setPoint(parsePointText(r.location));
      setTag(r.tag_number ?? "");
      setHuntDayId(r.hunt_day_id);
    });
  }, [editId]);

  // New harvest: take the GPS fix as it arrives (until the user saves).
  useEffect(() => {
    if (editId || !position) return;
    setPoint({ lat: position.lat, lon: position.lon });
    setAccuracy(position.accuracy);
  }, [editId, position?.lat, position?.lon]);

  const check = point ? checkAt(point) : null;
  const wmuCode = check?.wmuCode ?? (editId ? null : here?.wmuCode) ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const harvestedAt = new Date(`${date}T${time}`);
      const saved = await saveRecord("harvest_records", {
        ...(editId ? { id: editId } : {}),
        hunt_day_id: editId ? huntDayId : (hunt?.huntDayId ?? null),
        species,
        sex: lower<Enums<"sex_t">>(sex),
        age_class: lower<Enums<"age_class_t">>(age),
        method: lower<Enums<"method_t">>(method),
        harvested_at: harvestedAt.toISOString(),
        location: point ? toPointText(point) : null,
        wmu_code: wmuCode,
        tag_number: tag.trim() || null,
        photo_path: null,
      });
      if (photo) await db.photos.put({ id: saved.id, blob: photo });
      onSaved?.(navigator.onLine ? "Harvest saved" : "Harvest saved offline · will sync with signal");
      if (!editId) {
        setTag("");
        setPhoto(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="hf" onSubmit={handleSubmit}>
      <div className="hf-pair">
        <Field label="Species" icon="m5-chevron-down.svg" className="hf-species">
          <select value={species} onChange={(e) => setSpecies(e.target.value as Enums<"species_t">)}>
            {SPECIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="hf-group">
          <span className="field-label">Sex</span>
          <Segmented label="Sex" options={sexes} value={sex} onChange={setSex} />
        </div>
      </div>

      <div className="hf-group">
        <span className="field-label">Age</span>
        <Segmented label="Age" options={ages} value={age} onChange={setAge} />
      </div>

      <div className="hf-group">
        <span className="field-label">Method</span>
        <Segmented label="Method" options={methods} value={method} onChange={setMethod} />
      </div>

      <div className="hf-pair hf-even">
        <Field label="Date" icon="m5-calendar.svg">
          <input type="date" required value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time" icon="m5-clock.svg">
          <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      <div className="hf-group" style={{ gap: 6 }}>
        <div className="hf-location-head">
          <span className="field-label">Location</span>
          {point && !editId && (
            <span className="hf-autofill">
              <Icon name="m5-locate-green.svg" size={12} />
              Auto-filled from GPS
            </span>
          )}
          {editId && position && (
            <button type="button" className="hf-autofill" onClick={() => setPoint({ lat: position.lat, lon: position.lon })}>
              <Icon name="m5-locate-green.svg" size={12} />
              Use my GPS
            </button>
          )}
        </div>
        <div className="hf-location">
          <div className="hf-mini-map">
            {point ? (
              <RealMap
                key={`${point.lat.toFixed(4)},${point.lon.toFixed(4)}`}
                initialCenter={point}
                initialZoom={13}
                interactive={false}
                overlay={overlay}
                pins={[{ id: "here", point, kind: "harvest", title: "Harvest location" }]}
              />
            ) : (
              <RealMap initialCenter={DEFAULT_CENTER} initialZoom={6} interactive={false} />
            )}
          </div>
          <div className="hf-position">
            <span className="hf-place">
              <Icon name="m5-map-pin.svg" size={15} />
              {check?.land.area?.name ?? (check ? (check.land.status === "crown" ? "Crown land" : "Land not identified") : point ? "Location saved" : "Waiting for GPS…")}
            </span>
            <span className="hf-coords">{point ? formatPoint(point) : "Location will be added when GPS has a fix"}</span>
            {accuracy !== null && !editId && <span className="hf-accuracy">GPS ±{Math.round(accuracy)} m</span>}
          </div>
        </div>
      </div>

      <div className="hf-pair hf-even">
        <Field label="WMU · auto-filled" icon={wmuCode ? "m5-check-green.svg" : undefined}>
          <span>{wmuCode ?? "—"}</span>
        </Field>
        <Field label="Tag number" icon="m5-lock.svg">
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Optional" autoComplete="off" />
        </Field>
      </div>

      <button type="button" className="hf-photo" onClick={() => photoInput.current?.click()}>
        <Icon name="m5-camera.svg" size={21} />
        {photo ? "Photo added" : "Add photo"}
        <span className="hf-photo-optional">{photo ? photo.name : "Optional"}</span>
      </button>
      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />

      <div className="hf-save">
        <Button type="submit" icon="m5-check-dark.svg" block disabled={busy}>
          {editId ? "Save changes" : "Save harvest"}
        </Button>
        <p className="hf-offline">
          <Icon name="m5-cloud-off.svg" size={13} />
          Saved on this phone first · syncs when you're back in signal
        </p>
      </div>
    </form>
  );
}
