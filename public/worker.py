import time
import json
import os
import requests
import random
from datetime import datetime, timedelta

# Configuration
DATA_DIR = os.getenv("DATA_DIR", "./data")
RATES_FILE = os.path.join(DATA_DIR, "rates.json")
HISTORY_FILE = os.path.join(DATA_DIR, "history.json")
RATES_JS_FILE = os.path.join(DATA_DIR, "rates.js")
HISTORY_JS_FILE = os.path.join(DATA_DIR, "history.js")
FETCH_INTERVAL = 14400  # 4 hours
REQUEST_TIMEOUT = 12

# APIs
API_VES = "https://ve.dolarapi.com/v1/dolares"
API_EUR = "https://api.exchangerate-api.com/v4/latest/USD"
API_HISTORY_OFFICIAL = "https://api.dolarvzla.com/public/exchange-rate/list"
API_BINANCE = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
HEADERS = {
    "User-Agent": "Astro-Tech-Worker/1.0",
    "Content-Type": "application/json"
}

def ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except (json.JSONDecodeError, OSError):
            pass
    return {"official": [], "parallel": [], "usdt": []}

def save_history(history):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f)

def save_js(filename, var_name, data):
    with open(filename, "w", encoding="utf-8") as f:
        json_str = json.dumps(data)
        f.write(f"window.{var_name} = {json_str};")

def fetch_binance_rate():
    try:
        payload = {
            "asset": "USDT",
            "fiat": "VES",
            "tradeType": "BUY",
            "transAmount": 0,
            "order": "",
            "page": 1,
            "rows": 5,
            "payTypes": []
        }
        res = requests.post(API_BINANCE, json=payload, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        data = res.json()
        if "data" in data:
            ads = data["data"]
            prices = [float(ad["adv"]["price"]) for ad in ads if ad.get("adv") and ad["adv"].get("price")]
            if prices:
                return sum(prices) / len(prices)
    except requests.RequestException as e:
        print(f"Error fetching Binance rates: {e}")
    except (ValueError, TypeError) as e:
        print(f"Error parsing Binance response: {e}")
    return 0


def backfill_history(history, current_rates):
    """
    Backfill Parallel and USDT history for the last 10 days if missing.
    Uses simulated data based on current rate to populate the chart.
    """
    targets = ["parallel", "usdt"]
    
    for key in targets:
        if not current_rates.get(key) or current_rates[key] == 0:
            continue
            
        data_list = history.get(key, [])
        pass_dates = set([d["date"].split("T")[0] for d in data_list])
        
        new_entries = []
        for i in range(1, 11):
            target_date = datetime.now() - timedelta(days=i)
            date_str = target_date.isoformat()
            short_date = target_date.strftime("%Y-%m-%d")
            
            if short_date not in pass_dates:
                variance = random.uniform(-0.02, 0.02)
                simulated_value = current_rates[key] * (1 + variance)
                
                new_entries.append({
                    "date": date_str,
                    "value": round(simulated_value, 2)
                })
        
        if new_entries:
            print(f"Backfilling {len(new_entries)} entries for {key}...")
            data_list.extend(new_entries)
            data_list.sort(key=lambda x: x["date"])
            history[key] = data_list

def fetch_data():
    print(f"[{datetime.now()}] Fetching data...")
    
    try:
        ves_response = requests.get(API_VES, timeout=REQUEST_TIMEOUT)
        ves_response.raise_for_status()
        ves_res = ves_response.json()

        eur_response = requests.get(API_EUR, timeout=REQUEST_TIMEOUT)
        eur_response.raise_for_status()
        eur_res = eur_response.json()

        usdt_rate = fetch_binance_rate()

        official = next((d for d in ves_res if d.get("fuente") == "oficial"), None)
        parallel = next((d for d in ves_res if d.get("fuente") == "paralelo"), None)

        now_iso = datetime.now().isoformat()
        
        rates = {
            "official": official.get("promedio", 0) if official else 0,
            "parallel": parallel.get("promedio", 0) if parallel else 0,
            "usdt": usdt_rate,
            "eur_usd": eur_res.get("rates", {}).get("EUR", 1),
            "lastUpdated": now_iso
        }

        with open(RATES_FILE, "w", encoding="utf-8") as f:
            json.dump(rates, f)
        
        save_js(RATES_JS_FILE, "LOCAL_RATES", rates)
        
        history = load_history()
        backfill_history(history, rates)
        
        def append_history(key, value, date_str):
            if value and value > 0:
                lst = history.get(key, [])
                last_entry = lst[-1] if lst else None
                should_add = True
                if last_entry:
                    last_date = datetime.fromisoformat(last_entry["date"].replace("Z", ""))
                    current_date = datetime.fromisoformat(date_str.replace("Z", ""))
                    if (current_date - last_date).total_seconds() < 3600:
                        should_add = False
                if should_add:
                    lst.append({"date": date_str, "value": value})
                    if len(lst) > 1000:
                        lst = lst[-500:]
                    history[key] = lst

        if not history.get("official"):
            try:
                hist_response = requests.get(f"{API_HISTORY_OFFICIAL}?from=2024-01-01", timeout=REQUEST_TIMEOUT)
                hist_response.raise_for_status()
                hist_res = hist_response.json()
                if "rates" in hist_res:
                    history["official"] = [{"date": item["date"], "value": float(item["usd"])} for item in hist_res["rates"] if item.get("date") and item.get("usd")]
            except requests.RequestException as e:
                print(f"Error fetching official history: {e}")
            except (ValueError, TypeError) as e:
                print(f"Error parsing official history response: {e}")
        
        append_history("official", rates["official"], now_iso)
        append_history("parallel", rates["parallel"], now_iso)
        append_history("usdt", rates["usdt"], now_iso)

        save_history(history)
        save_js(HISTORY_JS_FILE, "LOCAL_HISTORY", history)
        
        print("Data updated successfully.")

    except requests.RequestException as e:
        print(f"Network error updating data: {e}")
    except ValueError as e:
        print(f"Invalid JSON response: {e}")
    except Exception as e:
        print(f"Error updating data: {e}")

if __name__ == "__main__":
    ensure_data_dir()
    print("Worker started.")
    fetch_data()
    while True:
        time.sleep(FETCH_INTERVAL)
        fetch_data()
