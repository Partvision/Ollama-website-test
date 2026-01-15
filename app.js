const OLLAMA_API = 'http://localhost:11434';
let currentModel = null;
let conversationHistory = [];
let availableModels = [];

const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const activeModelSpan = document.getElementById('activeModel');
const connectBtn = document.getElementById('connectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const connectionSection = document.getElementById('connectionSection');
const mainContent = document.getElementById('mainContent');

// Connect button handler
connectBtn.addEventListener('click', connectToOllama);

async function connectToOllama() {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  connectionStatus.textContent = 'Checking Ollama connection...';
  connectionStatus.className = 'connection-status';

  try {
    // Check if Ollama is running and get available models
    const response = await fetch(`${OLLAMA_API}/api/tags`);
    
    if (!response.ok) {
      throw new Error('Failed to connect to Ollama');
    }

    const data = await response.json();
    availableModels = data.models || [];

    connectionStatus.textContent = `Connected! Found ${availableModels.length} models`;
    connectionStatus.className = 'connection-status success';

    // Update model cards to show which are available
    updateModelCards();

    // Show main content after short delay
    setTimeout(() => {
      connectionSection.style.display = 'none';
      mainContent.style.display = 'block';
      document.querySelector('.models').style.display = 'block';
      document.querySelector('.chat').style.display = 'block';
      document.getElementById('toolsPanel').style.display = 'block';
      document.getElementById('settingsPanel').style.display = 'block';
    }, 1000);

  } catch (error) {
    console.error('Connection error:', error);
    connectionStatus.textContent = `Failed to connect. Make sure Ollama is running on ${OLLAMA_API}`;
    connectionStatus.className = 'connection-status error';
    connectBtn.disabled = false;
    connectBtn.textContent = 'Retry Connection';
  }
}

function updateModelCards() {
  document.querySelectorAll('.btn-load').forEach(btn => {
    const modelName = btn.dataset.model;
    const card = btn.closest('.model-card');
    
    // Check if model is available (allowing for version variations)
    const isAvailable = availableModels.some(m => 
      m.name.toLowerCase().includes(modelName.toLowerCase())
    );
    
    if (isAvailable) {
      card.classList.add('available');
      btn.textContent = 'Load Model';
      
      // Find the exact model name with version
      const exactModel = availableModels.find(m => 
        m.name.toLowerCase().includes(modelName.toLowerCase())
      );
      if (exactModel) {
        btn.dataset.model = exactModel.name;
      }
    }
  });
}

// Load model handlers
document.querySelectorAll('.btn-load').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const modelName = e.target.dataset.model;
    await loadModel(modelName, e.target);
  });
});

async function loadModel(modelName, btn) {
  // Reset all buttons
  document.querySelectorAll('.btn-load').forEach(b => {
    b.textContent = 'Load Model';
    b.classList.remove('loading');
    b.disabled = false;
  });

  btn.textContent = 'Pulling...';
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    // Pull the model from Ollama
    const response = await fetch(`${OLLAMA_API}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName })
    });

    if (!response.ok) {
      throw new Error('Failed to pull model');
    }

    // Stream the pull progress
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.status) {
            btn.textContent = data.status;
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    }

    currentModel = modelName;
    activeModelSpan.textContent = modelName;
    btn.textContent = 'Loaded';
    conversationHistory = [];
    
    messageInput.disabled = false;
    sendBtn.disabled = false;

    // Clear chat
    chatMessages.innerHTML = `
      <div class="message assistant">
        <div class="message-label">Assistant</div>
        <div>Model ${modelName} loaded. How can I help you?</div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading model:', error);
    btn.textContent = 'Failed';
    btn.classList.remove('loading');
    btn.disabled = false;
    
    alert(`Failed to load model. Make sure Ollama is running on ${OLLAMA_API}`);
  }
}

// Send message handler
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentModel) return;

  // Add user message
  addMessage('user', text);
  messageInput.value = '';
  
  // Disable input while processing
  messageInput.disabled = true;
  sendBtn.disabled = true;

  try {
    // Add to conversation history
    conversationHistory.push({ role: 'user', content: text });

    // Create assistant message placeholder
    const assistantDiv = document.createElement('div');
    assistantDiv.className = 'message assistant';
    assistantDiv.innerHTML = `
      <div class="message-label">Assistant</div>
      <div class="message-content"></div>
    `;
    chatMessages.appendChild(assistantDiv);
    const contentDiv = assistantDiv.querySelector('.message-content');

    // Call Ollama API with streaming
    const response = await fetch(`${OLLAMA_API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: currentModel,
        messages: conversationHistory,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get response');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullResponse += data.message.content;
            contentDiv.textContent = fullResponse;
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    }

    // Add assistant response to history
    conversationHistory.push({ role: 'assistant', content: fullResponse });

  } catch (error) {
    console.error('Error sending message:', error);
    addMessage('assistant', `Error: ${error.message}. Make sure Ollama is running.`);
  } finally {
    // Re-enable input
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

function addMessage(role, text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  messageDiv.innerHTML = `
    <div class="message-label">${role === 'user' ? 'You' : 'Assistant'}</div>
    <div class="message-content">${text}</div>
  `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}