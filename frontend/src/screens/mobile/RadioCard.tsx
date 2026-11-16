import { distanceKm } from "@maplehunt/geo";
import { Button, Icon } from "../../components/ui";
import { useGeo } from "../../data/geo";
import { connectionLabel, pairRadio, sendPosition, unpairRadio, useRadio } from "../../data/radio";
import { relativeTime } from "../../data/useRecords";

export function RadioCard() {
  const radio = useRadio();
  const { position } = useGeo();
  const connected = radio.connection === "connected";

  return (
    <div className="mp-radio">
      <div className="ms-row">
        <span className="mp-radio-status">
          <Icon name="m3-radio-white.svg" size={18} />
          {connectionLabel(radio.connection)}
        </span>
        {radio.nodeId && <span className="mp-radio-node">{radio.nodeId}</span>}
      </div>

      {!radio.supported ? (
        <div className="mp-radio-ids">
          <span>Pairing a radio needs Chrome on Android.</span>
        </div>
      ) : radio.connection === "disconnected" ? (
        <>
          <div className="mp-radio-ids">
            <span>Turn the radio on, then pair it over Bluetooth.</span>
          </div>
          <Button variant="soft" size="md" icon="m1-bluetooth.svg" iconSize={16} onClick={() => void pairRadio()}>
            Pair radio
          </Button>
        </>
      ) : (
        <>
          <div className="mp-radio-ids">
            <span>
              {radio.connection === "connecting" ? "Keep the radio close. Reconnecting automatically." : `Sent ${radio.lastSentAt ? relativeTime(new Date(radio.lastSentAt).toISOString()) : "nothing yet"}`}
            </span>
          </div>
          <div className="mp-radio-actions">
            <Button
              variant="soft"
              size="md"
              disabled={!connected || !position}
              onClick={() => position && void sendPosition({ lat: position.lat, lon: position.lon, fixAt: position.at }).catch(() => undefined)}
            >
              Send my position
            </Button>
            <Button variant="outline" size="md" className="mp-radio-disconnect" onClick={() => void unpairRadio()}>
              Disconnect
            </Button>
          </div>
        </>
      )}

      {radio.error && (
        <p className="mp-radio-error" role="alert">
          {radio.error}
        </p>
      )}

      {radio.heard.length > 0 && (
        <ul className="mp-radio-heard">
          {radio.heard.map(({ packet, receivedAt, hops, snr }) => (
            <li key={packet.nodeId}>
              <span>{packet.nodeId}</span>
              <span>
                {position ? `${distanceKm(position, packet).toFixed(2)} km · ` : ""}
                {relativeTime(new Date(receivedAt).toISOString())} · {hops === 1 ? "direct" : `${hops} hops`}
                {snr !== undefined ? ` · SNR ${snr.toFixed(1)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
