// motorist-chatbot.js
class MotoristChatbot {
    constructor(config = {}) {
        this.config = {
            apiBaseUrl: config.apiBaseUrl || '/api',
            containerId: config.containerId || 'motorist-chatbot',
            theme: config.theme || 'default',
            autoScroll: config.autoScroll !== false,
            showSidebar: config.showSidebar !== false,
            quickQuestions: config.quickQuestions || [
                'How do I renew my road tax?',
                'What is COE renewal?',
                'How to check traffic offence?',
                'Where can I scrap my car?'
            ],
            ...config
        };
        
        this.messages = [];
        this.isTyping = false;
        this.messageId = 1;
        this.connectionError = false;
        this.stats = { total_questions: 0, total_categories: 0 };
        this.categories = [];
        this.categoryCounts = {};
        
        this.init();
    }
    
    async init() {
        this.createContainer();
        this.attachStyles();
        this.bindEvents();
        await this.checkConnection();
        if (!this.connectionError) {
            await this.loadStats();
            await this.loadCategories();
        }
        this.render();
    }
    
    createContainer() {
        const container = document.getElementById(this.config.containerId);
        if (!container) {
            throw new Error(`Container with ID '${this.config.containerId}' not found`);
        }
        container.innerHTML = this.getHTML();
    }
    
    attachStyles() {
        if (!document.getElementById('motorist-chatbot-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'motorist-chatbot-styles';
            styleSheet.textContent = this.getCSS();
            document.head.appendChild(styleSheet);
        }
    }
    
    async checkConnection() {
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/health`);
            this.connectionError = !response.ok;
        } catch (error) {
            console.error('Connection error:', error);
            this.connectionError = true;
        }
    }
    
    async loadStats() {
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/stats`);
            this.stats = await response.json();
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    async loadCategories() {
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/categories`);
            const data = await response.json();
            this.categories = data.categories;
            this.categoryCounts = data.counts;
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }
    
    async sendMessage(messageText) {
        if (!messageText || this.isTyping || this.connectionError) return;
        
        // Add user message
        this.addMessage({
            type: 'user',
            content: messageText
        });
        
        this.isTyping = true;
        this.render();
        this.scrollToBottom();
        
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: messageText })
            });
            
            const data = await response.json();
            
            // Add bot response
            this.addMessage({
                type: 'bot',
                content: data.response,
                category: data.category,
                confidence: data.confidence,
                urls: data.urls,
                related_questions: data.related_questions
            });
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessage({
                type: 'bot',
                content: 'Sorry, there was an error processing your request. Please try again.',
                category: 'Error',
                confidence: 0,
                urls: [],
                related_questions: []
            });
        }
        
        this.isTyping = false;
        this.render();
        this.scrollToBottom();
    }
    
    addMessage(message) {
        this.messages.push({
            id: this.messageId++,
            timestamp: new Date(),
            ...message
        });
    }
    
    bindEvents() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.send-button')) {
                const input = document.querySelector('.message-input');
                this.sendMessage(input.value.trim());
                input.value = '';
            }
            
            if (e.target.matches('.quick-question')) {
                this.sendMessage(e.target.textContent);
            }
            
            if (e.target.matches('.related-question')) {
                this.sendMessage(e.target.textContent);
            }
            
            if (e.target.matches('.category-item')) {
                const category = e.target.querySelector('span').textContent;
                this.sendMessage(`Tell me about ${category} questions`);
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' && e.target.matches('.message-input')) {
                const input = e.target;
                this.sendMessage(input.value.trim());
                input.value = '';
            }
        });
    }
    
    render() {
        const container = document.getElementById(this.config.containerId);
        const messagesContainer = container.querySelector('.chat-messages');
        const statsElements = container.querySelectorAll('.stats-number');
        const categoriesContainer = container.querySelector('.categories-section');
        
        // Update messages
        messagesContainer.innerHTML = this.getMessagesHTML();
        
        // Update stats
        if (statsElements.length >= 2) {
            statsElements[0].textContent = this.stats.total_questions;
            statsElements[1].textContent = this.stats.total_categories;
        }
        
        // Update categories
        if (categoriesContainer) {
            const categoriesHTML = this.categories.map(category => `
                <div class="category-item">
                    <span>${category}</span>
                    <span class="category-count">${this.categoryCounts[category] || 0}</span>
                </div>
            `).join('');
            
            categoriesContainer.innerHTML = `
                <h3><i class="fas fa-tags"></i> Categories</h3>
                ${categoriesHTML}
            `;
        }
    }
    
    scrollToBottom() {
        setTimeout(() => {
            const container = document.querySelector('.chat-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 100);
    }
    
    getHTML() {
        return `
            <div class="app-container">
                ${this.config.showSidebar ? this.getSidebarHTML() : ''}
                <div class="main-content">
                    ${this.getHeaderHTML()}
                    <div class="chat-container">
                        <div class="chat-messages">
                            ${this.getWelcomeMessageHTML()}
                        </div>
                    </div>
                    ${this.getInputSectionHTML()}
                </div>
            </div>
        `;
    }
    
    getSidebarHTML() {
        return `
            <div class="sidebar">
                <h2><i class="fas fa-car"></i> Motorist AI</h2>
                <div class="stats-card">
                    <div class="stats-number">${this.stats.total_questions}</div>
                    <div class="stats-label">Total Questions</div>
                </div>
                <div class="stats-card">
                    <div class="stats-number">${this.stats.total_categories}</div>
                    <div class="stats-label">Categories</div>
                </div>
                <div class="categories-section">
                    <h3><i class="fas fa-tags"></i> Categories</h3>
                </div>
            </div>
        `;
    }
    
    getHeaderHTML() {
        return `
            <div class="header">
                <h1><i class="fas fa-robot"></i> Motorist Q&A Assistant</h1>
                <p>Get instant answers to your vehicle-related questions with official links</p>
            </div>
        `;
    }
    
    getWelcomeMessageHTML() {
        if (this.messages.length === 0 && !this.connectionError) {
            return `
                <div class="message bot">
                    <div class="message-avatar">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="message-content">
                        <strong>Welcome to Motorist Q&A!</strong><br>
                        I'm here to help with your vehicle-related questions.
                        <div class="quick-questions">
                            ${this.config.quickQuestions.map(q => `
                                <div class="quick-question">${q}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
        return '';
    }
    
    getMessagesHTML() {
        let html = this.getWelcomeMessageHTML();
        
        if (this.connectionError) {
            html += `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    Unable to connect to the chatbot server.
                </div>
            `;
        }
        
        html += this.messages.map(message => this.getMessageHTML(message)).join('');
        
        if (this.isTyping) {
            html += `
                <div class="message bot">
                    <div class="message-avatar">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="message-content">
                        <div class="typing-indicator">
                            <span>Assistant is typing</span>
                            <div class="typing-dots">
                                <div class="typing-dot"></div>
                                <div class="typing-dot"></div>
                                <div class="typing-dot"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        return html;
    }
    
    getMessageHTML(message) {
        const isUser = message.type === 'user';
        const avatar = isUser ? 'fas fa-user' : 'fas fa-robot';
        
        let content = `<div>${message.content}</div>`;
        
        if (!isUser) {
            if (message.category) {
                const confidenceClass = this.getConfidenceClass(message.confidence);
                content += `
                    <div class="message-meta">
                        <strong>Category:</strong> ${message.category}
                        <span class="${confidenceClass} confidence-badge">
                            ${Math.round(message.confidence * 100)}% match
                        </span>
                    </div>
                `;
            }
            
            if (message.urls && message.urls.length > 0) {
                content += `
                    <div class="urls-section">
                        <strong><i class="fas fa-link"></i> Helpful Links:</strong>
                        ${message.urls.map(url => `
                            <a href="${url}" target="_blank" class="url-link">
                                <i class="fas fa-external-link-alt"></i> ${this.formatUrl(url)}
                            </a>
                        `).join('')}
                    </div>
                `;
            }
            
            if (message.related_questions && message.related_questions.length > 0) {
                content += `
                    <div class="related-questions">
                        <strong><i class="fas fa-question-circle"></i> Related Questions:</strong>
                        ${message.related_questions.slice(0, 3).map(q => `
                            <div class="related-question">${q}</div>
                        `).join('')}
                    </div>
                `;
            }
        }
        
        return `
            <div class="message ${message.type}">
                <div class="message-avatar">
                    <i class="${avatar}"></i>
                </div>
                <div class="message-content">
                    ${content}
                </div>
            </div>
        `;
    }
    
    getInputSectionHTML() {
        return `
            <div class="input-section">
                <div class="input-container">
                    <input class="message-input" placeholder="Ask your motorist question..." />
                    <button class="send-button">
                        <i class="fas fa-paper-plane"></i>
                        Send
                    </button>
                </div>
            </div>
        `;
    }
    
    getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'confidence-high';
        if (confidence >= 0.5) return 'confidence-medium';
        return 'confidence-low';
    }
    
    formatUrl(url) {
        return url.length > 60 ? url.substring(0, 57) + '...' : url;
    }
    
    getCSS() {
        return `
            /* Include all the CSS from the original file here */
            .motorist-chatbot * { margin: 0; padding: 0; box-sizing: border-box; }
            .motorist-chatbot { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            /* ... rest of the CSS ... */
        `;
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MotoristChatbot;
} else if (typeof define === 'function' && define.amd) {
    define([], function() { return MotoristChatbot; });
} else {
    window.MotoristChatbot = MotoristChatbot;
}
