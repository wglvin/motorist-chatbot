from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
import numpy as np
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import PorterStemmer
import requests
from urllib.parse import urlparse
import os

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('tokenizers/punkt_tab')
    nltk.data.find('corpora/stopwords')
except LookupError:
    print("Downloading NLTK data...")
    nltk.download('punkt')
    nltk.download('punkt_tab')
    nltk.download('stopwords')

app = Flask(__name__)
CORS(app)

class MotoristChatbot:
    def __init__(self):
        self.questions = []
        self.answers = []
        self.categories = []
        self.urls = []
        self.vectorizer = TfidfVectorizer(stop_words='english', max_features=1000)
        self.category_classifier = None
        self.question_vectors = None
        self.stemmer = PorterStemmer()
        self.stop_words = set(stopwords.words('english'))
        
    def load_data_from_txt(self, txt_file_path):
        """Load and parse the scraped motorist data from txt file"""
        print("Loading data from txt file...")
        
        # Get the absolute path to the txt file
        current_dir = os.path.dirname(os.path.abspath(__file__))
        file_path = os.path.join(current_dir, '..', txt_file_path)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
        except FileNotFoundError:
            print(f"File not found: {file_path}")
            return 0
        
        sections = content.split('=' * 80)
        
        for section in sections:
            if section.strip():
                lines = section.strip().split('\n')
                category = ""
                question = ""
                answer = ""
                
                for line in lines:
                    line = line.strip()
                    if line.startswith('Category:'):
                        category = line.replace('Category:', '').strip()
                    elif line.startswith('Question:'):
                        question = line.replace('Question:', '').strip()
                    elif line.startswith('Answer:'):
                        answer = line.replace('Answer:', '').strip()
                        answer_index = lines.index(line)
                        for remaining_line in lines[answer_index + 1:]:
                            if remaining_line.strip() and not remaining_line.startswith('Category:') and not remaining_line.startswith('Question:'):
                                answer += " " + remaining_line.strip()
                        break
                
                if category and question and answer:
                    self.categories.append(category)
                    self.questions.append(question)
                    self.answers.append(answer.strip())
                    urls = self.extract_and_validate_urls(answer)
                    self.urls.append(urls)
        
        print(f"Loaded {len(self.questions)} questions from {len(set(self.categories))} categories")
        return len(self.questions)
    
    def extract_and_validate_urls(self, text):
        """Extract and validate URLs from text"""
        url_pattern = r'https?://(?:[-\w.])+(?:[:\d]+)?(?:/(?:[\w/_.-])*(?:\?(?:[\w&=%.-])*)?(?:#(?:[\w.-])*)?)?'
        urls = re.findall(url_pattern, text)
        
        cleaned_urls = []
        for url in urls:
            url = re.sub(r'[.,;:)]+$', '', url)
            url = self.fix_common_url_issues(url)
            
            if url.startswith('http') and len(url) > 10:
                parsed = urlparse(url)
                if parsed.netloc:
                    cleaned_urls.append(url)
        
        return cleaned_urls
    
    def fix_common_url_issues(self, url):
        """Fix common URL formatting issues"""
        url = re.sub(r'\)+$', '', url)
        
        url_fixes = {
            'https://vrl.lta.gov.sg/lta/vrl/action/pubfunc?ID=RoadTaxEnquiry)': 'https://vrl.lta.gov.sg/lta/vrl/action/pubfunc?ID=RoadTaxEnquiry',
            'https://vrl.lta.gov.sg/lta/vrl/action/pubfunc2?ID=EnquireRoadTaxExpDtProxy)': 'https://vrl.lta.gov.sg/lta/vrl/action/pubfunc2?ID=EnquireRoadTaxExpDtProxy',
            'https://onemotoring.lta.gov.sg/content/onemotoring/home.html.': 'https://onemotoring.lta.gov.sg/content/onemotoring/home.html'
        }
        
        return url_fixes.get(url, url)
    
    def get_fallback_urls(self, category):
        """Provide official fallback URLs by category"""
        fallback_urls = {
            'General': ['https://onemotoring.lta.gov.sg/content/onemotoring/home.html'],
            'Insurance': ['https://www.gia.org.sg', 'https://onemotoring.lta.gov.sg/content/onemotoring/home.html'],
            'Scrap/Export Car': ['https://onemotoring.lta.gov.sg/content/onemotoring/home.html'],
            'On The Road': ['https://www.police.gov.sg/Advisories/Traffic', 'https://onemotoring.lta.gov.sg/content/onemotoring/home.html'],
            'Maintenance': ['https://onemotoring.lta.gov.sg/content/onemotoring/home.html']
        }
        
        return fallback_urls.get(category, ['https://onemotoring.lta.gov.sg/content/onemotoring/home.html'])
    
    def preprocess_text(self, text):
        """Clean and preprocess text"""
        text = text.lower()
        text = re.sub(r'[^a-zA-Z\s]', '', text)
        tokens = word_tokenize(text)
        tokens = [self.stemmer.stem(token) for token in tokens 
                 if token not in self.stop_words and len(token) > 2]
        return ' '.join(tokens)
    
    def train_category_classifier(self):
        """Train a classifier to predict question categories"""
        print("Training category classifier...")
        processed_questions = [self.preprocess_text(q) for q in self.questions]
        self.category_classifier = Pipeline([
            ('tfidf', TfidfVectorizer(stop_words='english', max_features=500)),
            ('classifier', MultinomialNB())
        ])
        self.category_classifier.fit(processed_questions, self.categories)
        print("Category classifier trained successfully!")
    
    def build_question_index(self):
        """Build TF-IDF vectors for all questions for similarity matching"""
        print("Building question similarity index...")
        processed_questions = [self.preprocess_text(q) for q in self.questions]
        self.question_vectors = self.vectorizer.fit_transform(processed_questions)
        print("Question index built successfully!")
    
    def find_best_answer(self, user_question, top_k=3):
        """Find the best matching answer for a user question"""
        processed_question = self.preprocess_text(user_question)
        predicted_category = self.category_classifier.predict([processed_question])[0]
        user_vector = self.vectorizer.transform([processed_question])
        similarities = cosine_similarity(user_vector, self.question_vectors).flatten()
        top_indices = similarities.argsort()[-top_k:][::-1]
        
        results = []
        for idx in top_indices:
            if similarities[idx] > 0.1:
                results.append({
                    'question': self.questions[idx],
                    'answer': self.answers[idx],
                    'category': self.categories[idx],
                    'urls': self.urls[idx],
                    'similarity': similarities[idx]
                })
        
        return predicted_category, results
    
    def get_response(self, user_question):
        """Get chatbot response for user question"""
        predicted_category, matches = self.find_best_answer(user_question)
        
        if not matches:
            fallback_urls = self.get_fallback_urls(predicted_category)
            return {
                'response': "I'm sorry, I don't have specific information about that question. However, you can find general motorist information at the official OneMotoring website.",
                'category': predicted_category,
                'confidence': 0.0,
                'urls': fallback_urls,
                'related_questions': []
            }
        
        best_match = matches[0]
        
        all_urls = []
        for match in matches:
            all_urls.extend(match['urls'])
        
        unique_urls = list(set(all_urls))
        if not unique_urls:
            unique_urls = self.get_fallback_urls(best_match['category'])
        
        return {
            'response': best_match['answer'],
            'category': best_match['category'],
            'confidence': best_match['similarity'],
            'related_questions': [m['question'] for m in matches[1:]],
            'urls': unique_urls[:5]
        }
    
    def get_categories(self):
        """Get all available categories"""
        return list(set(self.categories))

# Initialize chatbot
print("Initializing Motorist Chatbot...")
chatbot = MotoristChatbot()
num_questions = chatbot.load_data_from_txt('motorist_questions_all.txt')

if num_questions > 0:
    chatbot.train_category_classifier()
    chatbot.build_question_index()
    print("Chatbot ready!")
else:
    print("Warning: No questions loaded!")

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    response = chatbot.get_response(user_message)
    return jsonify(response)

@app.route('/api/categories', methods=['GET'])
def get_categories():
    categories = chatbot.get_categories()
    category_counts = {}
    for cat in categories:
        category_counts[cat] = chatbot.categories.count(cat)
    
    return jsonify({
        'categories': sorted(categories),
        'counts': category_counts
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify({
        'total_questions': len(chatbot.questions),
        'total_categories': len(set(chatbot.categories)),
        'categories': sorted(list(set(chatbot.categories)))
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'questions_loaded': len(chatbot.questions),
        'categories': len(set(chatbot.categories))
    })

# Vercel serverless function handler
def handler(request):
    return app(request.environ, lambda *args: None)

if __name__ == '__main__':
    app.run(debug=True)
