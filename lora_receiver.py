"""
LoRa receiver — writes incoming sensor readings directly into the Django SQLite database.

Place this file next to manage.py. Run it alongside the Django server:
    python lora_receiver.py
"""
import sqlite3
import time
import re
import serial
from datetime import datetime, timezone
from pathlib import Path
import random

DB_PATH = Path(__file__).parent / 'db.sqlite3'


def save_reading(node: int, temperature: float) -> None:
    """Insert one temperature reading into the database."""
    try:
        # Django/SQLite erwartet das Format "YYYY-MM-DD HH:MM:SS.ffffff" (UTC, ohne 'T'
        # und ohne Offset). .isoformat() würde "…T…+00:00" schreiben; SQLite vergleicht
        # Datums-Strings zeichenweise, und 'T' (84) > ' ' (32) lässt dann alle Werte
        # fälschlich "größer" wirken → date__lte-/Range-Filter liefern nichts.
        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
        con = sqlite3.connect(DB_PATH)
        con.execute('PRAGMA journal_mode=WAL')
        con.execute(
            'INSERT INTO plot_sensortemperature (date, temperature, node) VALUES (?, ?, ?)',
            (timestamp, temperature, node)
        )
        con.commit()
        print(f"Saved: node={node}  temp={temperature}°C  at {timestamp}")
    except Exception as e:
        print(f"Error saving to database: {e}")
    finally:
        try:
            con.close()
        except Exception:
            pass

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

def dummy_receive_loop() -> None:
    """Dummy loop for testing without LoRa hardware."""
    while True:
        node_id = random.randint(1, 2)
        temp = 10*node_id + 5 * (1 + time.time() % 60 / 60) 
        on_packet_received(f"{node_id},{temp}".encode('utf-8'))
        time.sleep(5)

def read_serial_port() -> None:
    ser = serial.Serial('/dev/ttyACM0', 115200, timeout=1)  # Adjust port and baud rate as needed
    #Pattern on serial port: Start Receive: 1,23.9 :End Receive
    pattern = re.compile(r'Start Receive: (\d+),([\d.-]+) :End Receive') 
    while True:
        try:
            line = ser.readline().decode('utf-8').strip()
            if line != "":
                match = pattern.match(line)
                if match:
                    node_id = int(match.group(1))
                    temp = float(match.group(2))  
                    on_packet_received(f"{node_id},{temp}".encode('utf-8'))
                else:
                    print(f"Unrecognized line: {line}")
        except Exception as e:
            print(f"Error reading from serial port: {e}")
            time.sleep(1)  # Wait before retrying
            try: 
                ser.close()
                ser = serial.Serial('/dev/ttyACM0', 115200, timeout=1)  # Attempt to reopen the port
            except Exception as e:
                print(f"Critical error with serial port: {e}")

def main(dummy: bool = True) -> None:
    if dummy: #dummy mode for testing without LoRa hardware
        dummy_receive_loop()
    else:
        read_serial_port()
    


if __name__ == '__main__':
    main()
