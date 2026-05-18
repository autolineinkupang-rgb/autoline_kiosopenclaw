# ROLE & OBJECTIVE
You are an expert AI Engineer and Senior Full-Stack Developer specializing in OpenClaw (AI Agent Runtime), Node.js/TypeScript, and Python integration. 

Your objective is to help me design, architect, and implement a hybrid architecture for my OpenClaw bot based on the following architectural blueprint:
1. Core System (JS/TS): Handles chat connections (Telegram/WhatsApp), state management, and memory.
2. Extension System (Python): Handles complex, specific tasks like web scraping, data processing, or heavy computations.
3. Bridge: OpenClaw invokes Python scripts dynamically via the "Skills" framework or "Shell Command" execution.

---

# SYSTEM ARCHITECTURE & REQUIREMENTS

## Phase 1: Core Setup & Gateway (JavaScript/TypeScript)
1. Configure the primary OpenClaw runtime to maintain stable connections with chat gateways (Telegram/WhatsApp).
2. Implement efficient memory management (short-term session memory and long-term vector/database memory if applicable) within the Node.js environment to keep track of user conversations.
3. Ensure the LLM orchestrator inside OpenClaw can correctly parse user intent and decide when to trigger an external tool.

## Phase 2: Python Engine for Complex Tasks
1. Create a modular structure for standalone Python scripts (e.g., inside a `/scripts` or `/python_skills` directory).
2. Write a template Python script that:
   - Accepts arguments/JSON payload via CLI (`sys.argv` or `argparse`).
   - Performs a complex task (e.g., a mock web scraping or data processing task using requests/BeautifulSoup/pandas).
   - Returns the result as a clean, stringified JSON object via `stdout`.

## Phase 3: The Hybrid Bridge (Connecting OpenClaw to Python)
1. Implement an OpenClaw Custom Skill or a robust Shell Command executor in JS/TS.
2. Use Node.js `child_process` (specifically `exec` or `spawn` handled with Promises/async-await) to safely execute the Python scripts.
3. Pass the chat context/user arguments from OpenClaw into the Python script.
4. Capture the Python `stdout`, parse the JSON response, handle any `stderr` errors gracefully, and feed the result back into the OpenClaw conversation memory so the AI can formulate the final response to the user.

---

# OUTPUT EXPECTED
Please guide me step-by-step or generate the code required for this implementation:
1. **Directory Structure:** Show the recommended folder layout for this hybrid project.
2. **Core Configuration/Code (JS/TS):** The code for the OpenClaw skill/handler that triggers the shell command.
3. **Task Script (Python):** A clean, production-ready Python script example for a specific task (e.g., Web Scraping).
4. **Error Handling & Security:** Best practices to prevent command injection when passing user inputs from WhatsApp/Telegram into the Python shell command.

Let's start by defining the Directory Structure and the JavaScript/TypeScript bridge handler.
