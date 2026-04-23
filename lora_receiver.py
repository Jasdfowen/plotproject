"""
LoRa receiver — writes incoming sensor readings directly into the Django SQLite database.

Place this file next to manage.py. Run it alongside the Django server:
    python lora_receiver.py
"""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / 'db.sqlite3'


def save_reading(node: int, temperature: float) -> None:
    """Insert one temperature reading into the database."""
    timestamp = datetime.now(timezone.utc).isoformat()
    con = sqlite3.connect(DB_PATH)
    con.execute(
        'INSERT INTO plot_sensortemperature (date, temperature, node) VALUES (?, ?, ?)',
        (timestamp, temperature, node)
    )
    con.commit()
    con.close()
    print(f"Saved: node={node}  temp={temperature}°C  at {timestamp}")


# ---------------------------------------------------------------------------
# LoRa receive loop — replace the placeholder below with your HAT's library
# ---------------------------------------------------------------------------

def on_packet_received(raw_bytes: bytes) -> None:
    """
    Called for every incoming LoRa packet.
    Parse the raw bytes from your sensor here and call save_reading().
    """
    # Example: sensors transmit "node_id,temperature" as a plain string
    #   e.g. b"3,21.75"
    text = raw_bytes.decode('utf-8').strip()
    node_str, temp_str = text.split(',')
    save_reading(node=int(node_str), temperature=float(temp_str))


def main():
    print(f"Receiver started. Writing to {DB_PATH}")

    # --- Replace this block with your actual LoRa HAT initialisation ---
    # Example for Waveshare SX1262 (using their sx126x library):
    #
    # import sx126x
    # lora = sx126x.SX126X()
    # lora.LoRaConfig(freq=868, sf=7, bw=125, cr=5, preamble=8, CRC=True)
    # lora.startReceiving()
    #
    # while True:
    #     if lora.rxDone():
    #         packet = lora.readPacket()
    #         on_packet_received(bytes(packet))
    # -------------------------------------------------------------------

    # Placeholder loop for testing without hardware:
    import time
    node = 1
    while True:
        save_reading(node=node, temperature=20.0 + node)
        node = (node % 3) + 1   # cycle through nodes 1, 2, 3
        time.sleep(10)


if __name__ == '__main__':
    main()
