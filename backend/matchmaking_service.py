"""
AI-Based Matchmaking Service for Film Companion

This module implements an LLM-powered matchmaking algorithm that:
1. Filters candidates based on user preferences (hard filters)
2. Uses AI to score compatibility based on movie taste and profile similarity
3. Generates human-readable match explanations
4. Caches results in MongoDB for improved performance
"""

import os
import json
import asyncio
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
import random
from dotenv import load_dotenv

load_dotenv()

# Import emergent integrations for LLM
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    print("Warning: emergentintegrations not installed. Run: pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/")

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY")

# Cache expiry time (1 hour)
CACHE_EXPIRY_HOURS = 1


# ============== MOCK USER DATA ==============
# 20 diverse mock profiles for testing the matchmaking algorithm

MOCK_USERS = [
    {
        "user_id": "mock_user_001",
        "name": "Priya Sharma",
        "age": 24,
        "gender": "Female",
        "location": "Mumbai",
        "avatar": "av2",
        "profile_picture": "https://images.unsplash.com/photo-1631005436794-ccaa79de61ba?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1631005436794-ccaa79de61ba?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&h=600&fit=crop"
        ],
        "bio": "Film enthusiast who believes a good movie is the best first date. Looking for someone who appreciates storytelling as much as I do.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Romance", "Thriller"],
        "filmLanguages": ["Hindi", "English"],
        "languagesSpoken": ["Hindi", "English", "Marathi"],
        "topMovies": [
            {"title": "Dil Chahta Hai", "tmdb_id": 19666, "poster_path": "/vQSVx0Vz4dBoHXiJnZuYPLSidmL.jpg"},
            {"title": "The Notebook", "tmdb_id": 11036, "poster_path": "/rNzQyW4f8B8cQeg7Dgj3n6eT5k9.jpg"},
            {"title": "Andhadhun", "tmdb_id": 534780, "poster_path": "/epA93IshB3S4y5KdzRzeBsHHXvS.jpg"}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'5\"",
        "religion": "Hindu",
        "zodiac": "Libra",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Sometimes",
        "education": "Master's Degree",
        "workProfile": "Marketing Manager",
        "swipe_history": {
            "liked_genres": ["Drama", "Romance", "Thriller", "Comedy"],
            "disliked_genres": ["Horror", "War"],
            "liked_actors": ["Shah Rukh Khan", "Aamir Khan", "Ryan Gosling"],
            "liked_directors": ["Zoya Akhtar", "Christopher Nolan"]
        }
    },
    {
        "user_id": "mock_user_002",
        "name": "Arjun Mehta",
        "age": 31,
        "gender": "Male",
        "location": "Delhi",
        "avatar": "av4",
        "bio": "Sci-fi nerd and Marvel fanatic. If you can quote Inception or debate whether Blade Runner is better than 2049, we'll get along great!",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Sci-Fi", "Action", "Thriller"],
        "filmLanguages": ["English", "Hindi"],
        "languagesSpoken": ["Hindi", "English", "Punjabi"],
        "topMovies": [
            {"title": "Inception", "tmdb_id": 27205, "poster_path": "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"},
            {"title": "Interstellar", "tmdb_id": 157336, "poster_path": "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"},
            {"title": "The Dark Knight", "tmdb_id": 155, "poster_path": "/qJ2tW6WMUDux911r6m7haRef0WH.jpg"}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "OTT",
        "height": "5'11\"",
        "religion": "Hindu",
        "zodiac": "Scorpio",
        "smoking": "Never",
        "drinking": "Occasionally",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Software Engineer",
        "swipe_history": {
            "liked_genres": ["Sci-Fi", "Action", "Thriller", "Mystery"],
            "disliked_genres": ["Romance", "Musical"],
            "liked_actors": ["Christian Bale", "Leonardo DiCaprio", "Tom Hardy"],
            "liked_directors": ["Christopher Nolan", "Denis Villeneuve", "Ridley Scott"]
        }
    },
    {
        "user_id": "mock_user_003",
        "name": "Ananya Reddy",
        "age": 23,
        "gender": "Female",
        "location": "Bangalore",
        "avatar": "av3",
        "profile_picture": "https://images.unsplash.com/photo-1619516388835-2b60acc4049e?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1619516388835-2b60acc4049e?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1710967074868-2041e4f44c17?w=400&h=600&fit=crop"
        ],
        "bio": "Indie film lover. Give me a slow-burn drama over a blockbuster any day. Currently obsessed with A24 films.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Drama", "Indie", "Documentary"],
        "filmLanguages": ["English", "Telugu", "Hindi"],
        "languagesSpoken": ["Telugu", "English", "Hindi", "Kannada"],
        "topMovies": [
            {"title": "Moonlight", "tmdb_id": 376867},
            {"title": "Lady Bird", "tmdb_id": 391713},
            {"title": "C/o Kancharapalem", "tmdb_id": 556574}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "OTT",
        "height": "5'4\"",
        "religion": "Hindu",
        "zodiac": "Pisces",
        "smoking": "Never",
        "drinking": "Rarely",
        "exercise": "Sometimes",
        "education": "Master's Degree",
        "workProfile": "UX Designer",
        "swipe_history": {
            "liked_genres": ["Drama", "Indie", "Documentary", "Art House"],
            "disliked_genres": ["Action", "Horror", "Superhero"],
            "liked_actors": ["Timothée Chalamet", "Saoirse Ronan", "Florence Pugh"],
            "liked_directors": ["Greta Gerwig", "Barry Jenkins", "Chloé Zhao"]
        }
    },
    {
        "user_id": "mock_user_004",
        "name": "Rahul Kapoor",
        "age": 29,
        "gender": "Male",
        "location": "Mumbai",
        "avatar": "av1",
        "bio": "Bollywood buff with a soft spot for 90s romance. Can recite DDLJ dialogues on demand. Looking for my Simran!",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Romance", "Drama", "Comedy"],
        "filmLanguages": ["Hindi", "English"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "Dilwale Dulhania Le Jayenge", "tmdb_id": 19404, "poster_path": "/2CAL2433ZeIihfX1Hb2139CX0pW.jpg"},
            {"title": "Jab We Met", "tmdb_id": 20453},
            {"title": "Yeh Jawaani Hai Deewani", "tmdb_id": 228161}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'9\"",
        "religion": "Hindu",
        "zodiac": "Leo",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Investment Banker",
        "swipe_history": {
            "liked_genres": ["Romance", "Drama", "Comedy", "Musical"],
            "disliked_genres": ["Horror", "Thriller"],
            "liked_actors": ["Shah Rukh Khan", "Ranbir Kapoor", "Deepika Padukone"],
            "liked_directors": ["Aditya Chopra", "Imtiaz Ali", "Karan Johar"]
        }
    },
    {
        "user_id": "mock_user_005",
        "name": "Neha Gupta",
        "age": 24,
        "gender": "Female",
        "location": "Pune",
        "avatar": "av5",
        "profile_picture": "https://images.unsplash.com/photo-1479936343636-73cdc5aae0c3?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1479936343636-73cdc5aae0c3?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1599746146388-a7ec2004b67a?w=400&h=600&fit=crop"
        ],
        "bio": "Horror movie addict who watches scary films alone at midnight. Need a movie buddy who won't judge my screaming!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Something casual", "New friends"],
        "genres": ["Horror", "Thriller", "Mystery"],
        "filmLanguages": ["Hindi", "English"],
        "languagesSpoken": ["Hindi", "English", "Marathi"],
        "topMovies": [
            {"title": "Tumbbad", "tmdb_id": 534734, "poster_path": "/bxrbmhJVW0G5ZPfBq3NN3SXOoRQ.jpg"},
            {"title": "Get Out", "tmdb_id": 419430},
            {"title": "Hereditary", "tmdb_id": 493559}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "OTT",
        "height": "5'3\"",
        "religion": "Hindu",
        "zodiac": "Scorpio",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Sometimes",
        "education": "Bachelor's Degree",
        "workProfile": "Content Writer",
        "swipe_history": {
            "liked_genres": ["Horror", "Thriller", "Mystery", "Psychological"],
            "disliked_genres": ["Romance", "Comedy", "Musical"],
            "liked_actors": ["Toni Collette", "Daniel Kaluuya"],
            "liked_directors": ["Jordan Peele", "Ari Aster", "Rahi Anil Barve"]
        }
    },
    {
        "user_id": "mock_user_006",
        "name": "Vikram Singh",
        "age": 33,
        "gender": "Male",
        "location": "Chennai",
        "avatar": "av6",
        "bio": "South Indian cinema enthusiast. Rajinikanth is religion. Also appreciate good world cinema. Let's discuss films over filter coffee!",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Action", "Drama", "Comedy"],
        "filmLanguages": ["Tamil", "Telugu", "Hindi", "English"],
        "languagesSpoken": ["Tamil", "English", "Hindi"],
        "topMovies": [
            {"title": "Vikram", "tmdb_id": 811367},
            {"title": "Baahubali", "tmdb_id": 301337},
            {"title": "Jai Bhim", "tmdb_id": 913290}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Theatre",
        "height": "5'10\"",
        "religion": "Hindu",
        "zodiac": "Aries",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Master's Degree",
        "workProfile": "Business Analyst",
        "swipe_history": {
            "liked_genres": ["Action", "Drama", "Thriller", "Comedy"],
            "disliked_genres": ["Horror"],
            "liked_actors": ["Rajinikanth", "Kamal Haasan", "Suriya", "Vijay"],
            "liked_directors": ["Lokesh Kanagaraj", "Pa. Ranjith", "Mani Ratnam"]
        }
    },
    {
        "user_id": "mock_user_007",
        "name": "Sanjana Iyer",
        "age": 23,
        "gender": "Female",
        "location": "Hyderabad",
        "avatar": "av2",
        "profile_picture": "https://images.pexels.com/photos/11555705/pexels-photo-11555705.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/11555705/pexels-photo-11555705.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1710967074868-2041e4f44c17?w=400&h=600&fit=crop"
        ],
        "bio": "K-drama convert who still loves Tollywood. Weekends are for binge-watching. Looking for someone to share popcorn and theories with!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Romance", "Drama", "Comedy"],
        "filmLanguages": ["Telugu", "Hindi", "Korean", "English"],
        "languagesSpoken": ["Telugu", "Hindi", "English"],
        "topMovies": [
            {"title": "Arjun Reddy", "tmdb_id": 453500},
            {"title": "Parasite", "tmdb_id": 496243, "poster_path": "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg"},
            {"title": "Zindagi Na Milegi Dobara", "tmdb_id": 76788, "poster_path": "/nIYh4DWZX7FLJGkTfON7VR70U9c.jpg"}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "OTT",
        "height": "5'6\"",
        "religion": "Hindu",
        "zodiac": "Cancer",
        "smoking": "Never",
        "drinking": "Occasionally",
        "exercise": "Rarely",
        "education": "Bachelor's Degree",
        "workProfile": "HR Professional",
        "swipe_history": {
            "liked_genres": ["Romance", "Drama", "Comedy", "Thriller"],
            "disliked_genres": ["Horror", "War"],
            "liked_actors": ["Vijay Deverakonda", "Song Kang", "Ranveer Singh"],
            "liked_directors": ["Sandeep Reddy Vanga", "Bong Joon-ho", "Zoya Akhtar"]
        }
    },
    {
        "user_id": "mock_user_008",
        "name": "Karan Malhotra",
        "age": 30,
        "gender": "Male",
        "location": "Gurgaon",
        "avatar": "av4",
        "bio": "Documentary and true crime obsessed. If you've seen Making a Murderer thrice, we should talk. Also into stand-up comedy specials.",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Documentary", "True Crime", "Comedy"],
        "filmLanguages": ["English", "Hindi"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "The Social Dilemma", "tmdb_id": 662418},
            {"title": "Don't Look Up", "tmdb_id": 646380},
            {"title": "Our Planet", "tmdb_id": 83880}
        ],
        "movieFrequency": "Daily",
        "ottTheatre": "OTT",
        "height": "6'0\"",
        "religion": "Hindu",
        "zodiac": "Gemini",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Master's Degree",
        "workProfile": "Product Manager",
        "swipe_history": {
            "liked_genres": ["Documentary", "Comedy", "Drama", "True Crime"],
            "disliked_genres": ["Romance", "Musical", "Fantasy"],
            "liked_actors": ["Adam McKay productions"],
            "liked_directors": ["David Attenborough", "Werner Herzog"]
        }
    },
    {
        "user_id": "mock_user_009",
        "name": "Meera Nair",
        "age": 24,
        "gender": "Female",
        "location": "Kochi",
        "avatar": "av3",
        "profile_picture": "https://images.pexels.com/photos/26208424/pexels-photo-26208424.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/26208424/pexels-photo-26208424.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1680711552692-76a8bd810398?w=400&h=600&fit=crop"
        ],
        "bio": "Malayalam cinema fan who also loves French New Wave. Yes, I watch films with subtitles by choice. Cinephile looking for fellow film buff.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Art House", "World Cinema"],
        "filmLanguages": ["Malayalam", "English", "French", "Hindi"],
        "languagesSpoken": ["Malayalam", "English", "Hindi"],
        "topMovies": [
            {"title": "Kumbalangi Nights", "tmdb_id": 588228},
            {"title": "The Great Indian Kitchen", "tmdb_id": 807127},
            {"title": "Portrait of a Lady on Fire", "tmdb_id": 531428}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'4\"",
        "religion": "Hindu",
        "zodiac": "Virgo",
        "smoking": "Never",
        "drinking": "Rarely",
        "exercise": "Sometimes",
        "education": "Master's Degree",
        "workProfile": "Professor",
        "swipe_history": {
            "liked_genres": ["Drama", "Art House", "World Cinema", "Romance"],
            "disliked_genres": ["Action", "Horror", "Superhero"],
            "liked_actors": ["Fahadh Faasil", "Léa Seydoux"],
            "liked_directors": ["Lijo Jose Pellissery", "Céline Sciamma", "Wong Kar-wai"]
        }
    },
    {
        "user_id": "mock_user_010",
        "name": "Aditya Verma",
        "age": 27,
        "gender": "Male",
        "location": "Mumbai",
        "avatar": "av1",
        "bio": "Animation and anime enthusiast. Studio Ghibli is my comfort zone. Also appreciate good superhero films. Let's marathon Miyazaki!",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship", "New friends"],
        "genres": ["Animation", "Anime", "Fantasy", "Superhero"],
        "filmLanguages": ["Japanese", "English", "Hindi"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "Spirited Away", "tmdb_id": 129},
            {"title": "Your Name", "tmdb_id": 372058},
            {"title": "Spider-Man: Across the Spider-Verse", "tmdb_id": 569094}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "Both",
        "height": "5'8\"",
        "religion": "Hindu",
        "zodiac": "Aquarius",
        "smoking": "Never",
        "drinking": "Occasionally",
        "exercise": "Sometimes",
        "education": "Bachelor's Degree",
        "workProfile": "Animator",
        "swipe_history": {
            "liked_genres": ["Animation", "Anime", "Fantasy", "Superhero", "Sci-Fi"],
            "disliked_genres": ["Horror", "War", "Drama"],
            "liked_actors": ["Tom Holland", "Voice actors"],
            "liked_directors": ["Hayao Miyazaki", "Makoto Shinkai", "Phil Lord"]
        }
    },
    {
        "user_id": "mock_user_011",
        "name": "Riya Patel",
        "age": 23,
        "gender": "Female",
        "location": "Ahmedabad",
        "avatar": "av5",
        "profile_picture": "https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1622782045716-a05bcc4f5ae8?w=400&h=600&fit=crop"
        ],
        "bio": "90s kid who grew up on FRIENDS and Bollywood. Love feel-good movies and romantic comedies. Looking for my lobster!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Comedy", "Romance", "Drama"],
        "filmLanguages": ["Hindi", "English", "Gujarati"],
        "languagesSpoken": ["Gujarati", "Hindi", "English"],
        "topMovies": [
            {"title": "Hum Dil De Chuke Sanam", "tmdb_id": 21566},
            {"title": "Crazy Rich Asians", "tmdb_id": 455207},
            {"title": "The Proposal", "tmdb_id": 18240}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "OTT",
        "height": "5'3\"",
        "religion": "Hindu",
        "zodiac": "Taurus",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "CA",
        "swipe_history": {
            "liked_genres": ["Comedy", "Romance", "Drama", "Family"],
            "disliked_genres": ["Horror", "Thriller", "War"],
            "liked_actors": ["Salman Khan", "Sandra Bullock", "Julia Roberts"],
            "liked_directors": ["Sanjay Leela Bhansali", "Nancy Meyers"]
        }
    },
    {
        "user_id": "mock_user_012",
        "name": "Rohan Deshmukh",
        "age": 32,
        "gender": "Male",
        "location": "Pune",
        "avatar": "av6",
        "bio": "Classic cinema lover. Hitchcock, Kurosawa, Satyajit Ray - the greats. Also enjoy modern masterpieces. Looking for intellectually stimulating conversations.",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Classic", "Drama", "Thriller", "World Cinema"],
        "filmLanguages": ["English", "Hindi", "Japanese", "Bengali"],
        "languagesSpoken": ["Hindi", "English", "Marathi"],
        "topMovies": [
            {"title": "Pather Panchali", "tmdb_id": 10627},
            {"title": "Seven Samurai", "tmdb_id": 346},
            {"title": "Psycho", "tmdb_id": 539}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'10\"",
        "religion": "Hindu",
        "zodiac": "Capricorn",
        "smoking": "Never",
        "drinking": "Rarely",
        "exercise": "Sometimes",
        "education": "PhD",
        "workProfile": "Film Critic",
        "swipe_history": {
            "liked_genres": ["Classic", "Drama", "Thriller", "World Cinema", "Noir"],
            "disliked_genres": ["Superhero", "Action", "Comedy"],
            "liked_actors": ["Cary Grant", "Toshiro Mifune", "Soumitra Chatterjee"],
            "liked_directors": ["Alfred Hitchcock", "Akira Kurosawa", "Satyajit Ray"]
        }
    },
    {
        "user_id": "mock_user_013",
        "name": "Tanya Saxena",
        "age": 23,
        "gender": "Female",
        "location": "Jaipur",
        "avatar": "av2",
        "profile_picture": "https://images.pexels.com/photos/36041239/pexels-photo-36041239.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/36041239/pexels-photo-36041239.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1729101143891-a8fed18023f2?w=400&h=600&fit=crop"
        ],
        "bio": "New to dating apps! Love action movies and Marvel. Yes, I cried during Endgame. Looking for someone to watch movies with on lazy Sundays.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Action", "Superhero", "Adventure"],
        "filmLanguages": ["Hindi", "English"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "Avengers: Endgame", "tmdb_id": 299534, "poster_path": "/or06FN3Dka5tukK1e9sl16pB3iy.jpg"},
            {"title": "Top Gun: Maverick", "tmdb_id": 361743},
            {"title": "RRR", "tmdb_id": 579974}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Theatre",
        "height": "5'5\"",
        "religion": "Hindu",
        "zodiac": "Sagittarius",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Fashion Designer",
        "swipe_history": {
            "liked_genres": ["Action", "Superhero", "Adventure", "Sci-Fi"],
            "disliked_genres": ["Horror", "Documentary"],
            "liked_actors": ["Robert Downey Jr.", "Tom Cruise", "Ram Charan"],
            "liked_directors": ["Russo Brothers", "S.S. Rajamouli"]
        }
    },
    {
        "user_id": "mock_user_014",
        "name": "Siddharth Rao",
        "age": 29,
        "gender": "Male",
        "location": "Bangalore",
        "avatar": "av4",
        "bio": "Tech by day, cinephile by night. Love thought-provoking sci-fi and mind-bending thrillers. Let's debate plot holes over coffee!",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Sci-Fi", "Thriller", "Mystery"],
        "filmLanguages": ["English", "Hindi", "Kannada"],
        "languagesSpoken": ["Kannada", "Hindi", "English"],
        "topMovies": [
            {"title": "Arrival", "tmdb_id": 329865},
            {"title": "Prisoners", "tmdb_id": 146233},
            {"title": "Prestige", "tmdb_id": 1124}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "OTT",
        "height": "5'11\"",
        "religion": "Hindu",
        "zodiac": "Virgo",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Master's Degree",
        "workProfile": "Data Scientist",
        "swipe_history": {
            "liked_genres": ["Sci-Fi", "Thriller", "Mystery", "Drama"],
            "disliked_genres": ["Romance", "Musical", "Comedy"],
            "liked_actors": ["Jake Gyllenhaal", "Amy Adams", "Christian Bale"],
            "liked_directors": ["Denis Villeneuve", "Christopher Nolan", "David Fincher"]
        }
    },
    {
        "user_id": "mock_user_015",
        "name": "Ishita Das",
        "age": 24,
        "gender": "Female",
        "location": "Kolkata",
        "avatar": "av3",
        "profile_picture": "https://images.unsplash.com/photo-1558377235-76f53857000b?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1558377235-76f53857000b?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1674278882093-3870ef98e826?w=400&h=600&fit=crop"
        ],
        "bio": "Bengali cinema runs in my blood. Also love international dramas. Looking for someone who appreciates slow cinema and meaningful stories.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Art House", "World Cinema"],
        "filmLanguages": ["Bengali", "Hindi", "English"],
        "languagesSpoken": ["Bengali", "Hindi", "English"],
        "topMovies": [
            {"title": "Aparajito", "tmdb_id": 10628},
            {"title": "Byomkesh Bakshi (2015)", "tmdb_id": 330428},
            {"title": "The Lunchbox", "tmdb_id": 195374}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'4\"",
        "religion": "Hindu",
        "zodiac": "Cancer",
        "smoking": "Never",
        "drinking": "Rarely",
        "exercise": "Sometimes",
        "education": "Master's Degree",
        "workProfile": "Journalist",
        "swipe_history": {
            "liked_genres": ["Drama", "Art House", "World Cinema", "Mystery"],
            "disliked_genres": ["Action", "Horror", "Superhero"],
            "liked_actors": ["Irrfan Khan", "Nawazuddin Siddiqui", "Sushant Singh Rajput"],
            "liked_directors": ["Satyajit Ray", "Dibakar Banerjee", "Ritesh Batra"]
        }
    },
    {
        "user_id": "mock_user_016",
        "name": "Arnav Joshi",
        "age": 26,
        "gender": "Male",
        "location": "Delhi",
        "avatar": "av1",
        "bio": "Sports documentaries and biographical films are my jam. Also love a good underdog story. F1 fan who loved the Netflix series!",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship", "New friends"],
        "genres": ["Documentary", "Biography", "Sports", "Drama"],
        "filmLanguages": ["English", "Hindi"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "Drive to Survive", "tmdb_id": 87082},
            {"title": "Dangal", "tmdb_id": 360814, "poster_path": "/6rGJbtDPyYdFo0FTtGiYTyVc1K3.jpg"},
            {"title": "The Last Dance", "tmdb_id": 99424}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "OTT",
        "height": "5'9\"",
        "religion": "Hindu",
        "zodiac": "Aries",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Very Active",
        "education": "Bachelor's Degree",
        "workProfile": "Sports Journalist",
        "swipe_history": {
            "liked_genres": ["Documentary", "Biography", "Sports", "Drama", "Action"],
            "disliked_genres": ["Horror", "Fantasy", "Musical"],
            "liked_actors": ["Aamir Khan", "Will Smith", "Sylvester Stallone"],
            "liked_directors": ["Nitesh Tiwari", "Ron Howard"]
        }
    },
    {
        "user_id": "mock_user_017",
        "name": "Kavya Menon",
        "age": 24,
        "gender": "Female",
        "location": "Chennai",
        "avatar": "av5",
        "profile_picture": "https://images.pexels.com/photos/14928074/pexels-photo-14928074.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/14928074/pexels-photo-14928074.jpeg?w=400&h=600&fit=crop",
            "https://images.pexels.com/photos/7176438/pexels-photo-7176438.jpeg?w=400&h=600&fit=crop"
        ],
        "bio": "Music-lover who judges films by their soundtrack. AR Rahman fan. Love musicals and films with great background scores.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Musical", "Drama", "Romance"],
        "filmLanguages": ["Tamil", "Hindi", "English"],
        "languagesSpoken": ["Tamil", "Malayalam", "Hindi", "English"],
        "topMovies": [
            {"title": "Roja", "tmdb_id": 144233},
            {"title": "La La Land", "tmdb_id": 313369, "poster_path": "/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg"},
            {"title": "Rockstar", "tmdb_id": 87827}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Theatre",
        "height": "5'5\"",
        "religion": "Hindu",
        "zodiac": "Libra",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Sometimes",
        "education": "Master's Degree",
        "workProfile": "Music Teacher",
        "swipe_history": {
            "liked_genres": ["Musical", "Drama", "Romance", "Biography"],
            "disliked_genres": ["Horror", "Thriller", "War"],
            "liked_actors": ["Ryan Gosling", "Emma Stone", "Ranbir Kapoor"],
            "liked_directors": ["Mani Ratnam", "Damien Chazelle", "Imtiaz Ali"]
        }
    },
    {
        "user_id": "mock_user_018",
        "name": "Kunal Bhatia",
        "age": 28,
        "gender": "Male",
        "location": "Mumbai",
        "avatar": "av6",
        "bio": "Comedy is my therapy. From stand-up specials to Hera Pheri, I love anything that makes me laugh. Looking for someone with a great sense of humor!",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Comedy", "Satire", "Drama"],
        "filmLanguages": ["Hindi", "English"],
        "languagesSpoken": ["Hindi", "English", "Gujarati"],
        "topMovies": [
            {"title": "Hera Pheri", "tmdb_id": 21574},
            {"title": "Andaz Apna Apna", "tmdb_id": 22033},
            {"title": "Superbad", "tmdb_id": 8363}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "OTT",
        "height": "5'8\"",
        "religion": "Hindu",
        "zodiac": "Gemini",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Sometimes",
        "education": "Bachelor's Degree",
        "workProfile": "Stand-up Comedian",
        "swipe_history": {
            "liked_genres": ["Comedy", "Satire", "Parody", "Drama"],
            "disliked_genres": ["Horror", "War", "Documentary"],
            "liked_actors": ["Paresh Rawal", "Akshay Kumar", "Seth Rogen"],
            "liked_directors": ["Priyadarshan", "David Dhawan", "Judd Apatow"]
        }
    },
    {
        "user_id": "mock_user_019",
        "name": "Sneha Krishnan",
        "age": 23,
        "gender": "Female",
        "location": "Hyderabad",
        "avatar": "av2",
        "profile_picture": "https://images.unsplash.com/photo-1780247723311-2dae151784d1?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1780247723311-2dae151784d1?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1759840278381-bf7d5e332050?w=400&h=600&fit=crop"
        ],
        "bio": "Fantasy and adventure lover. Harry Potter shaped my childhood. Now into GoT-style epics. Looking for my adventure partner!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Fantasy", "Adventure", "Sci-Fi"],
        "filmLanguages": ["English", "Telugu", "Hindi"],
        "languagesSpoken": ["Telugu", "English", "Hindi"],
        "topMovies": [
            {"title": "Lord of the Rings: Return of the King", "tmdb_id": 122},
            {"title": "Harry Potter and the Prisoner of Azkaban", "tmdb_id": 673},
            {"title": "Dune", "tmdb_id": 438631}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'6\"",
        "religion": "Hindu",
        "zodiac": "Leo",
        "smoking": "Never",
        "drinking": "Occasionally",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Game Developer",
        "swipe_history": {
            "liked_genres": ["Fantasy", "Adventure", "Sci-Fi", "Action"],
            "disliked_genres": ["Horror", "Documentary", "Drama"],
            "liked_actors": ["Timothée Chalamet", "Cate Blanchett"],
            "liked_directors": ["Peter Jackson", "Denis Villeneuve", "Alfonso Cuarón"]
        }
    },
    {
        "user_id": "mock_user_020",
        "name": "Dhruv Sharma",
        "age": 31,
        "gender": "Male",
        "location": "Noida",
        "avatar": "av4",
        "bio": "War films and historical epics enthusiast. Love stories of courage and sacrifice. Also into political thrillers. History buff at heart.",
        "partnerPreference": "Women",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["War", "Historical", "Political Thriller", "Drama"],
        "filmLanguages": ["Hindi", "English"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "1917", "tmdb_id": 530915},
            {"title": "Border", "tmdb_id": 26996},
            {"title": "Schindler's List", "tmdb_id": 424}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'11\"",
        "religion": "Hindu",
        "zodiac": "Capricorn",
        "smoking": "Never",
        "drinking": "Rarely",
        "exercise": "Active",
        "education": "Master's Degree",
        "workProfile": "Defense Analyst",
        "swipe_history": {
            "liked_genres": ["War", "Historical", "Political Thriller", "Drama", "Biography"],
            "disliked_genres": ["Comedy", "Romance", "Animation"],
            "liked_actors": ["Tom Hanks", "Sunny Deol", "Liam Neeson"],
            "liked_directors": ["Steven Spielberg", "Christopher Nolan", "Sam Mendes"]
        }
    },
    # ============== ADDITIONAL FEMALE PROFILES ==============
    {
        "user_id": "mock_user_021",
        "name": "Aanya Malhotra",
        "age": 23,
        "gender": "Female",
        "location": "Bangalore",
        "avatar": "av2",
        "profile_picture": "https://images.pexels.com/photos/33824984/pexels-photo-33824984.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/33824984/pexels-photo-33824984.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1618245472177-2a74ad3b994a?w=400&h=600&fit=crop"
        ],
        "bio": "Tech girl by day, Netflix binger by night. Looking for someone to decode life's mysteries with, one movie at a time.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Sci-Fi", "Thriller", "Drama"],
        "filmLanguages": ["English", "Hindi", "Kannada"],
        "languagesSpoken": ["Kannada", "Hindi", "English"],
        "topMovies": [
            {"title": "Interstellar", "tmdb_id": 157336},
            {"title": "Gone Girl", "tmdb_id": 210577},
            {"title": "Vikram", "tmdb_id": 811367}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "OTT",
        "height": "5'5\"",
        "religion": "Hindu",
        "zodiac": "Gemini",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Master's Degree",
        "workProfile": "Software Engineer",
        "swipe_history": {
            "liked_genres": ["Sci-Fi", "Thriller", "Drama", "Mystery"],
            "disliked_genres": ["Horror", "War"],
            "liked_actors": ["Matthew McConaughey", "Ben Affleck", "Kamal Haasan"],
            "liked_directors": ["Christopher Nolan", "David Fincher", "Lokesh Kanagaraj"]
        }
    },
    {
        "user_id": "mock_user_022",
        "name": "Diya Singhania",
        "age": 24,
        "gender": "Female",
        "location": "Mumbai",
        "avatar": "av3",
        "profile_picture": "https://images.pexels.com/photos/34451076/pexels-photo-34451076.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/34451076/pexels-photo-34451076.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1588842867976-fd084ca2c87b?w=400&h=600&fit=crop"
        ],
        "bio": "Bollywood romantic at heart. Grew up on SRK films and still believe in 'Pyaar dosti hai'. Seeking my DDLJ moment!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Romance", "Drama", "Comedy"],
        "filmLanguages": ["Hindi", "English"],
        "languagesSpoken": ["Hindi", "English", "Gujarati"],
        "topMovies": [
            {"title": "Dilwale Dulhania Le Jayenge", "tmdb_id": 19404},
            {"title": "Kal Ho Naa Ho", "tmdb_id": 20742},
            {"title": "Kabhi Khushi Kabhie Gham", "tmdb_id": 10757}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'4\"",
        "religion": "Hindu",
        "zodiac": "Cancer",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Sometimes",
        "education": "Bachelor's Degree",
        "workProfile": "Fashion Designer",
        "swipe_history": {
            "liked_genres": ["Romance", "Drama", "Comedy", "Musical"],
            "disliked_genres": ["Horror", "Action", "War"],
            "liked_actors": ["Shah Rukh Khan", "Ranveer Singh", "Alia Bhatt"],
            "liked_directors": ["Karan Johar", "Imtiaz Ali", "Sanjay Leela Bhansali"]
        }
    },
    {
        "user_id": "mock_user_023",
        "name": "Kiara Verma",
        "age": 23,
        "gender": "Female",
        "location": "Delhi",
        "avatar": "av5",
        "profile_picture": "https://images.pexels.com/photos/35589203/pexels-photo-35589203.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/35589203/pexels-photo-35589203.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1599746146388-a7ec2004b67a?w=400&h=600&fit=crop"
        ],
        "bio": "Marvel fangirl who cried during Iron Man's snap. If you can debate Avengers theories over chai, we're soulmates!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Action", "Superhero", "Sci-Fi"],
        "filmLanguages": ["English", "Hindi"],
        "languagesSpoken": ["Hindi", "English", "Punjabi"],
        "topMovies": [
            {"title": "Avengers: Endgame", "tmdb_id": 299534},
            {"title": "Iron Man", "tmdb_id": 1726},
            {"title": "Guardians of the Galaxy", "tmdb_id": 118340}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "Theatre",
        "height": "5'6\"",
        "religion": "Hindu",
        "zodiac": "Leo",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Marketing Executive",
        "swipe_history": {
            "liked_genres": ["Action", "Superhero", "Sci-Fi", "Adventure"],
            "disliked_genres": ["Horror", "Documentary"],
            "liked_actors": ["Robert Downey Jr.", "Chris Hemsworth", "Tom Holland"],
            "liked_directors": ["Russo Brothers", "James Gunn", "Taika Waititi"]
        }
    },
    {
        "user_id": "mock_user_024",
        "name": "Myra Kapoor",
        "age": 24,
        "gender": "Female",
        "location": "Gurgaon",
        "avatar": "av2",
        "profile_picture": "https://images.unsplash.com/flagged/photo-1551854716-8b811be39e7e?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/flagged/photo-1551854716-8b811be39e7e?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1638018756542-3faa8f8618f1?w=400&h=600&fit=crop"
        ],
        "bio": "Corporate by day, crime documentary junkie by night. Currently investigating why I'm single. Accepting co-detectives!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Documentary", "True Crime", "Thriller"],
        "filmLanguages": ["English", "Hindi"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "Making a Murderer", "tmdb_id": 63351},
            {"title": "The Social Dilemma", "tmdb_id": 662418},
            {"title": "Wild Wild Country", "tmdb_id": 72745}
        ],
        "movieFrequency": "Daily",
        "ottTheatre": "OTT",
        "height": "5'5\"",
        "religion": "Hindu",
        "zodiac": "Virgo",
        "smoking": "Never",
        "drinking": "Occasionally",
        "exercise": "Active",
        "education": "MBA",
        "workProfile": "Consultant",
        "swipe_history": {
            "liked_genres": ["Documentary", "True Crime", "Thriller", "Drama"],
            "disliked_genres": ["Romance", "Musical", "Fantasy"],
            "liked_actors": ["Documentary subjects"],
            "liked_directors": ["Werner Herzog", "Ava DuVernay", "Ken Burns"]
        }
    },
    {
        "user_id": "mock_user_025",
        "name": "Saanvi Reddy",
        "age": 23,
        "gender": "Female",
        "location": "Hyderabad",
        "avatar": "av3",
        "profile_picture": "https://images.pexels.com/photos/35869868/pexels-photo-35869868.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/35869868/pexels-photo-35869868.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1503160865267-af4660ce7bf2?w=400&h=600&fit=crop"
        ],
        "bio": "Telugu cinema enthusiast who believes RRR deserved every Oscar. Animation lover since childhood. Let's watch Ghibli together!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Action", "Animation", "Drama"],
        "filmLanguages": ["Telugu", "Hindi", "English"],
        "languagesSpoken": ["Telugu", "Hindi", "English"],
        "topMovies": [
            {"title": "RRR", "tmdb_id": 579974},
            {"title": "Spirited Away", "tmdb_id": 129},
            {"title": "Pushpa", "tmdb_id": 928381}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "Both",
        "height": "5'3\"",
        "religion": "Hindu",
        "zodiac": "Aquarius",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Sometimes",
        "education": "Bachelor's Degree",
        "workProfile": "Graphic Designer",
        "swipe_history": {
            "liked_genres": ["Action", "Animation", "Drama", "Fantasy"],
            "disliked_genres": ["Horror", "War"],
            "liked_actors": ["Jr. NTR", "Ram Charan", "Allu Arjun"],
            "liked_directors": ["S.S. Rajamouli", "Hayao Miyazaki", "Sukumar"]
        }
    },
    {
        "user_id": "mock_user_026",
        "name": "Aditi Sharma",
        "age": 24,
        "gender": "Female",
        "location": "Pune",
        "avatar": "av5",
        "profile_picture": "https://images.unsplash.com/photo-1706943262459-3ef6ce03305c?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1706943262459-3ef6ce03305c?w=400&h=600&fit=crop",
            "https://images.pexels.com/photos/7176438/pexels-photo-7176438.jpeg?w=400&h=600&fit=crop"
        ],
        "bio": "A24 films are my love language. Looking for someone who appreciates slow cinema and meaningful conversations over filter coffee.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Indie", "Art House"],
        "filmLanguages": ["English", "Hindi", "Marathi"],
        "languagesSpoken": ["Marathi", "Hindi", "English"],
        "topMovies": [
            {"title": "Everything Everywhere All at Once", "tmdb_id": 545611},
            {"title": "Moonlight", "tmdb_id": 376867},
            {"title": "The Lunchbox", "tmdb_id": 195374}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'4\"",
        "religion": "Hindu",
        "zodiac": "Pisces",
        "smoking": "Never",
        "drinking": "Rarely",
        "exercise": "Sometimes",
        "education": "Master's Degree",
        "workProfile": "Film Critic",
        "swipe_history": {
            "liked_genres": ["Drama", "Indie", "Art House", "World Cinema"],
            "disliked_genres": ["Action", "Horror", "Superhero"],
            "liked_actors": ["Michelle Yeoh", "Irrfan Khan", "Florence Pugh"],
            "liked_directors": ["Daniels", "Barry Jenkins", "Chloé Zhao"]
        }
    },
    {
        "user_id": "mock_user_027",
        "name": "Rhea Iyer",
        "age": 23,
        "gender": "Female",
        "location": "Chennai",
        "avatar": "av2",
        "profile_picture": "https://images.unsplash.com/photo-1557296387-5358ad7997bb?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1557296387-5358ad7997bb?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1463335361701-e90f4c5045d0?w=400&h=600&fit=crop"
        ],
        "bio": "AR Rahman melodies + Sunday rain + good company = perfect date. Tamil cinema runs in my veins. Kamal Haasan supremacy!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Musical", "Romance"],
        "filmLanguages": ["Tamil", "Hindi", "English"],
        "languagesSpoken": ["Tamil", "English", "Hindi"],
        "topMovies": [
            {"title": "Vikram Vedha", "tmdb_id": 443306},
            {"title": "96", "tmdb_id": 549618},
            {"title": "Soorarai Pottru", "tmdb_id": 762902}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Theatre",
        "height": "5'5\"",
        "religion": "Hindu",
        "zodiac": "Libra",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Classical Dancer",
        "swipe_history": {
            "liked_genres": ["Drama", "Musical", "Romance", "Thriller"],
            "disliked_genres": ["Horror", "War"],
            "liked_actors": ["Vijay Sethupathi", "Kamal Haasan", "Trisha"],
            "liked_directors": ["Mani Ratnam", "Vetrimaaran", "Sudha Kongara"]
        }
    },
    {
        "user_id": "mock_user_028",
        "name": "Zara Khan",
        "age": 23,
        "gender": "Female",
        "location": "Mumbai",
        "avatar": "av3",
        "profile_picture": "https://images.unsplash.com/photo-1497487231007-0a45e7b4b68a?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1497487231007-0a45e7b4b68a?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1552113125-81af17f36b57?w=400&h=600&fit=crop"
        ],
        "bio": "Horror movie enthusiast who watches scary films alone at 3 AM. Looking for a brave soul to share the scares with!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Horror", "Thriller", "Mystery"],
        "filmLanguages": ["Hindi", "English"],
        "languagesSpoken": ["Hindi", "Urdu", "English"],
        "topMovies": [
            {"title": "Tumbbad", "tmdb_id": 534734},
            {"title": "Hereditary", "tmdb_id": 493559},
            {"title": "The Conjuring", "tmdb_id": 138843}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "OTT",
        "height": "5'6\"",
        "religion": "Muslim",
        "zodiac": "Scorpio",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Sometimes",
        "education": "Bachelor's Degree",
        "workProfile": "Interior Designer",
        "swipe_history": {
            "liked_genres": ["Horror", "Thriller", "Mystery", "Psychological"],
            "disliked_genres": ["Romance", "Comedy", "Musical"],
            "liked_actors": ["Toni Collette", "Florence Pugh", "Sohum Shah"],
            "liked_directors": ["Ari Aster", "Jordan Peele", "Rahi Anil Barve"]
        }
    },
    {
        "user_id": "mock_user_029",
        "name": "Ira Banerjee",
        "age": 24,
        "gender": "Female",
        "location": "Kolkata",
        "avatar": "av5",
        "profile_picture": "https://images.unsplash.com/photo-1622207691293-5cd80466dab3?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1622207691293-5cd80466dab3?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1516239482977-b550ba7253f2?w=400&h=600&fit=crop"
        ],
        "bio": "Bengali cinema lover with a soft spot for Satyajit Ray. Can discuss Feluda theories for hours. Looking for my intellectual match!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Mystery", "Art House"],
        "filmLanguages": ["Bengali", "Hindi", "English"],
        "languagesSpoken": ["Bengali", "Hindi", "English"],
        "topMovies": [
            {"title": "Pather Panchali", "tmdb_id": 10627},
            {"title": "Feluda: Gorosthaney Sabdhan", "tmdb_id": 221612},
            {"title": "Kahaani", "tmdb_id": 121232}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'4\"",
        "religion": "Hindu",
        "zodiac": "Cancer",
        "smoking": "Never",
        "drinking": "Rarely",
        "exercise": "Sometimes",
        "education": "Master's Degree",
        "workProfile": "Professor",
        "swipe_history": {
            "liked_genres": ["Drama", "Mystery", "Art House", "World Cinema"],
            "disliked_genres": ["Action", "Horror", "Superhero"],
            "liked_actors": ["Soumitra Chatterjee", "Vidya Balan", "Konkona Sen"],
            "liked_directors": ["Satyajit Ray", "Srijit Mukherji", "Rituparno Ghosh"]
        }
    },
    {
        "user_id": "mock_user_030",
        "name": "Aisha Nair",
        "age": 23,
        "gender": "Female",
        "location": "Kochi",
        "avatar": "av2",
        "profile_picture": "https://images.pexels.com/photos/36041239/pexels-photo-36041239.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/36041239/pexels-photo-36041239.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1729101143891-a8fed18023f2?w=400&h=600&fit=crop"
        ],
        "bio": "Malayalam new wave cinema is life! Kumbalangi Nights is my comfort film. Looking for someone who appreciates good storytelling.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Drama", "Comedy", "Romance"],
        "filmLanguages": ["Malayalam", "Hindi", "English"],
        "languagesSpoken": ["Malayalam", "Hindi", "English"],
        "topMovies": [
            {"title": "Kumbalangi Nights", "tmdb_id": 588228},
            {"title": "Bangalore Days", "tmdb_id": 278431},
            {"title": "Premam", "tmdb_id": 346700}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "Both",
        "height": "5'5\"",
        "religion": "Hindu",
        "zodiac": "Taurus",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Doctor",
        "swipe_history": {
            "liked_genres": ["Drama", "Comedy", "Romance", "Thriller"],
            "disliked_genres": ["Horror", "War"],
            "liked_actors": ["Fahadh Faasil", "Dulquer Salmaan", "Nivin Pauly"],
            "liked_directors": ["Lijo Jose Pellissery", "Dileesh Pothan", "Alphonse Puthren"]
        }
    },
    {
        "user_id": "mock_user_031",
        "name": "Navya Gupta",
        "age": 23,
        "gender": "Female",
        "location": "Noida",
        "avatar": "av3",
        "profile_picture": "https://images.unsplash.com/photo-1512310604669-443f26c35f52?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1512310604669-443f26c35f52?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&h=600&fit=crop"
        ],
        "bio": "K-drama addict trying to find my own Korean romance. Also love Bollywood masala entertainers. Life's too short for boring movies!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Romance", "Drama", "Comedy"],
        "filmLanguages": ["Korean", "Hindi", "English"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "Parasite", "tmdb_id": 496243},
            {"title": "Train to Busan", "tmdb_id": 396535},
            {"title": "Zindagi Na Milegi Dobara", "tmdb_id": 76788}
        ],
        "movieFrequency": "Daily",
        "ottTheatre": "OTT",
        "height": "5'4\"",
        "religion": "Hindu",
        "zodiac": "Sagittarius",
        "smoking": "Never",
        "drinking": "Occasionally",
        "exercise": "Sometimes",
        "education": "Bachelor's Degree",
        "workProfile": "Social Media Manager",
        "swipe_history": {
            "liked_genres": ["Romance", "Drama", "Comedy", "Thriller"],
            "disliked_genres": ["Horror", "War", "Documentary"],
            "liked_actors": ["Song Joong-ki", "Hyun Bin", "Ranveer Singh"],
            "liked_directors": ["Bong Joon-ho", "Zoya Akhtar", "Park Chan-wook"]
        }
    },
    {
        "user_id": "mock_user_032",
        "name": "Tara Mehta",
        "age": 23,
        "gender": "Female",
        "location": "Ahmedabad",
        "avatar": "av5",
        "profile_picture": "https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1622782045716-a05bcc4f5ae8?w=400&h=600&fit=crop"
        ],
        "bio": "Fantasy and sci-fi nerd. Harry Potter house: Ravenclaw. If you can discuss the ending of Inception, let's talk!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Fantasy", "Sci-Fi", "Adventure"],
        "filmLanguages": ["English", "Hindi", "Gujarati"],
        "languagesSpoken": ["Gujarati", "Hindi", "English"],
        "topMovies": [
            {"title": "Harry Potter and the Deathly Hallows", "tmdb_id": 12445},
            {"title": "Lord of the Rings", "tmdb_id": 120},
            {"title": "Dune", "tmdb_id": 438631}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "Both",
        "height": "5'3\"",
        "religion": "Hindu",
        "zodiac": "Aquarius",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Game Developer",
        "swipe_history": {
            "liked_genres": ["Fantasy", "Sci-Fi", "Adventure", "Action"],
            "disliked_genres": ["Horror", "Documentary"],
            "liked_actors": ["Timothée Chalamet", "Emma Watson", "Daniel Radcliffe"],
            "liked_directors": ["Denis Villeneuve", "Christopher Nolan", "Peter Jackson"]
        }
    },
    {
        "user_id": "mock_user_033",
        "name": "Simran Kaur",
        "age": 24,
        "gender": "Female",
        "location": "Chandigarh",
        "avatar": "av2",
        "profile_picture": "https://images.pexels.com/photos/33824984/pexels-photo-33824984.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/33824984/pexels-photo-33824984.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1618245472177-2a74ad3b994a?w=400&h=600&fit=crop"
        ],
        "bio": "Punjabi by heart, rom-com lover by choice. Looking for my Shah Rukh Khan in a world full of ordinary heroes!",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Romance", "Comedy", "Drama"],
        "filmLanguages": ["Hindi", "Punjabi", "English"],
        "languagesSpoken": ["Punjabi", "Hindi", "English"],
        "topMovies": [
            {"title": "Veer-Zaara", "tmdb_id": 11597},
            {"title": "Jab We Met", "tmdb_id": 20453},
            {"title": "Udta Punjab", "tmdb_id": 381005}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Theatre",
        "height": "5'6\"",
        "religion": "Sikh",
        "zodiac": "Aries",
        "smoking": "Never",
        "drinking": "Socially",
        "exercise": "Active",
        "education": "Bachelor's Degree",
        "workProfile": "Event Planner",
        "swipe_history": {
            "liked_genres": ["Romance", "Comedy", "Drama", "Action"],
            "disliked_genres": ["Horror", "Documentary"],
            "liked_actors": ["Shah Rukh Khan", "Diljit Dosanjh", "Kareena Kapoor"],
            "liked_directors": ["Yash Chopra", "Imtiaz Ali", "Abhishek Chaubey"]
        }
    },
    {
        "user_id": "mock_user_034",
        "name": "Nisha Pillai",
        "age": 24,
        "gender": "Female",
        "location": "Trivandrum",
        "avatar": "av3",
        "profile_picture": "https://images.pexels.com/photos/26208424/pexels-photo-26208424.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/26208424/pexels-photo-26208424.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1680711552692-76a8bd810398?w=400&h=600&fit=crop"
        ],
        "bio": "Documentary filmmaker who believes every life is a story worth telling. Looking for someone with depth and passion for cinema.",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship"],
        "genres": ["Documentary", "Drama", "World Cinema"],
        "filmLanguages": ["Malayalam", "English", "Hindi"],
        "languagesSpoken": ["Malayalam", "Tamil", "English", "Hindi"],
        "topMovies": [
            {"title": "The Great Indian Kitchen", "tmdb_id": 807127},
            {"title": "Jallikattu", "tmdb_id": 595997},
            {"title": "Churuli", "tmdb_id": 789743}
        ],
        "movieFrequency": "Weekly",
        "ottTheatre": "Both",
        "height": "5'4\"",
        "religion": "Hindu",
        "zodiac": "Virgo",
        "smoking": "Never",
        "drinking": "Rarely",
        "exercise": "Sometimes",
        "education": "Master's Degree",
        "workProfile": "Documentary Filmmaker",
        "swipe_history": {
            "liked_genres": ["Documentary", "Drama", "World Cinema", "Art House"],
            "disliked_genres": ["Action", "Superhero"],
            "liked_actors": ["Fahadh Faasil", "Chemban Vinod Jose"],
            "liked_directors": ["Lijo Jose Pellissery", "Jeo Baby", "Dileesh Pothan"]
        }
    },
    {
        "user_id": "mock_user_035",
        "name": "Pooja Singh",
        "age": 23,
        "gender": "Female",
        "location": "Lucknow",
        "avatar": "av5",
        "profile_picture": "https://images.pexels.com/photos/34451076/pexels-photo-34451076.jpeg?w=400&h=600&fit=crop",
        "pictures": [
            "https://images.pexels.com/photos/34451076/pexels-photo-34451076.jpeg?w=400&h=600&fit=crop",
            "https://images.unsplash.com/photo-1588842867976-fd084ca2c87b?w=400&h=600&fit=crop"
        ],
        "bio": "Anime otaku who also loves Bollywood masala. My perfect weekend is Studio Ghibli marathon + biryani. Any takers?",
        "partnerPreference": "Men",
        "relationshipIntent": ["Long-term relationship", "Something casual"],
        "genres": ["Animation", "Anime", "Romance"],
        "filmLanguages": ["Japanese", "Hindi", "English"],
        "languagesSpoken": ["Hindi", "English"],
        "topMovies": [
            {"title": "Your Name", "tmdb_id": 372058},
            {"title": "My Neighbor Totoro", "tmdb_id": 8392},
            {"title": "Weathering with You", "tmdb_id": 568160}
        ],
        "movieFrequency": "Daily",
        "ottTheatre": "OTT",
        "height": "5'2\"",
        "religion": "Hindu",
        "zodiac": "Pisces",
        "smoking": "Never",
        "drinking": "Never",
        "exercise": "Rarely",
        "education": "Bachelor's Degree",
        "workProfile": "Animator",
        "swipe_history": {
            "liked_genres": ["Animation", "Anime", "Romance", "Fantasy"],
            "disliked_genres": ["Horror", "War"],
            "liked_actors": ["Voice actors"],
            "liked_directors": ["Makoto Shinkai", "Hayao Miyazaki", "Mamoru Hosoda"]
        }
    }
]


def get_all_mock_users() -> List[Dict]:
    """Return all mock users for testing - with mode fields added"""
    # Add movieBuddyMode and movieDateMode to all mock users
    users_with_modes = []
    for user in MOCK_USERS:
        user_copy = user.copy()
        # Assign modes based on user index for variety
        user_idx = int(user["user_id"].split("_")[-1])
        if user_idx % 3 == 0:
            # Both modes enabled
            user_copy["movieBuddyMode"] = True
            user_copy["movieDateMode"] = True
        elif user_idx % 3 == 1:
            # Date mode only
            user_copy["movieBuddyMode"] = False
            user_copy["movieDateMode"] = True
        else:
            # Buddy mode only
            user_copy["movieBuddyMode"] = True
            user_copy["movieDateMode"] = False
        users_with_modes.append(user_copy)
    return users_with_modes


def get_mock_user_by_id(user_id: str) -> Optional[Dict]:
    """Get a specific mock user by ID"""
    for user in MOCK_USERS:
        if user["user_id"] == user_id:
            return user
    return None


# ============== CACHE SERVICE ==============
# MongoDB connection will be passed from server.py

_db = None

def set_db(db_instance):
    """Set the MongoDB database instance for caching"""
    global _db
    _db = db_instance


async def get_cached_matches(user_id: str) -> Optional[Dict]:
    """
    Get cached matches for a user if they exist and are not expired.
    
    Returns:
        Dict with matches data if cache hit and not expired, None otherwise
    """
    if _db is None:
        return None
    
    try:
        cache_entry = await _db.match_cache.find_one({"user_id": user_id})
        
        if cache_entry:
            cached_at = cache_entry.get("cached_at")
            if cached_at:
                # Check if cache is still valid (less than 1 hour old)
                expiry_time = cached_at + timedelta(hours=CACHE_EXPIRY_HOURS)
                if datetime.utcnow() < expiry_time:
                    print(f"Cache HIT for user {user_id} - returning cached matches")
                    return cache_entry
                else:
                    print(f"Cache EXPIRED for user {user_id}")
            else:
                print(f"Cache entry has no timestamp for user {user_id}")
        else:
            print(f"Cache MISS for user {user_id}")
        
        return None
    except Exception as e:
        print(f"Cache read error: {e}")
        return None


async def save_matches_to_cache(user_id: str, matches: List[Dict], profile_hash: str) -> bool:
    """
    Save matches to cache with timestamp.
    
    Args:
        user_id: The user's ID
        matches: List of matched profiles
        profile_hash: Hash of user profile to invalidate cache on profile change
    
    Returns:
        True if saved successfully, False otherwise
    """
    if _db is None:
        return False
    
    try:
        cache_entry = {
            "user_id": user_id,
            "matches": matches,
            "profile_hash": profile_hash,
            "cached_at": datetime.utcnow(),
            "match_count": len(matches)
        }
        
        # Upsert - update if exists, insert if not
        await _db.match_cache.update_one(
            {"user_id": user_id},
            {"$set": cache_entry},
            upsert=True
        )
        
        print(f"Cache SAVED for user {user_id} with {len(matches)} matches")
        return True
    except Exception as e:
        print(f"Cache write error: {e}")
        return False


async def invalidate_user_cache(user_id: str) -> bool:
    """
    Invalidate (delete) cached matches for a user.
    Call this when user updates their profile or preferences.
    """
    if _db is None:
        return False
    
    try:
        result = await _db.match_cache.delete_one({"user_id": user_id})
        print(f"Cache INVALIDATED for user {user_id}, deleted: {result.deleted_count}")
        return result.deleted_count > 0
    except Exception as e:
        print(f"Cache invalidation error: {e}")
        return False


def generate_profile_hash(profile: Dict) -> str:
    """
    Generate a simple hash of profile to detect changes.
    If profile changes significantly, we should regenerate matches.
    """
    key_fields = [
        str(profile.get("partnerPreference", "")),
        str(profile.get("genres", [])),
        str(profile.get("filmLanguages", [])),
        str(profile.get("relationshipIntent", [])),
        str(profile.get("topMovies", []))
    ]
    return str(hash("".join(key_fields)))


# ============== FILTERING SERVICE ==============

def check_mode_compatibility(user_mode: str, user_profile: Dict, candidate: Dict) -> bool:
    """
    Check if the candidate's mode is compatible with the user's current mode.
    
    Rules:
    - Buddy mode user can ONLY see candidates who have buddy mode enabled
    - Date mode user can ONLY see candidates who have date mode enabled
    - Users with BOTH modes enabled can be shown to either
    
    Args:
        user_mode: Current user's active mode ('buddy' or 'date')
        user_profile: Current user's profile
        candidate: Candidate profile to check
    
    Returns:
        True if modes are compatible, False otherwise
    """
    # Get candidate's mode settings
    candidate_buddy_mode = candidate.get("movieBuddyMode", False)
    candidate_date_mode = candidate.get("movieDateMode", False)
    
    # If candidate has no modes set, skip them
    if not candidate_buddy_mode and not candidate_date_mode:
        return False
    
    if user_mode == "buddy":
        # Buddy mode user can only see candidates with buddy mode enabled
        return candidate_buddy_mode
    elif user_mode == "date":
        # Date mode user can only see candidates with date mode enabled
        return candidate_date_mode
    else:
        # Default to date mode if not specified
        return candidate_date_mode


def check_filter_match(
    candidate_value: any,
    filter_config: Dict,
    filter_type: str = "selection"
) -> tuple[bool, bool]:
    """
    Check if a candidate matches a filter criteria.
    
    Returns:
        (matches_strictly, matches_expanded)
        - matches_strictly: True if candidate passes strict filter
        - matches_expanded: True if candidate could pass with expanded criteria
    """
    if not filter_config:
        return (True, True)
    
    selected = filter_config.get("selected", [])
    exclusive = filter_config.get("exclusive", False)
    expand_if_run_out = filter_config.get("expandIfRunOut", True)
    
    # If no selection made, pass everyone
    if not selected:
        return (True, True)
    
    # Handle different value types
    if isinstance(candidate_value, list):
        # Check if any of candidate's values match selected
        has_match = any(v in selected for v in candidate_value)
    else:
        has_match = candidate_value in selected
    
    if has_match:
        return (True, True)
    
    # No match - check if we should exclude
    if exclusive and not expand_if_run_out:
        # Strict filter, no expansion allowed - hard reject
        return (False, False)
    elif exclusive and expand_if_run_out:
        # Strict but can expand - reject for strict, allow for expanded
        return (False, True)
    else:
        # Not exclusive - allow
        return (True, True)


def check_age_filter(candidate_age: int, age_filter: Dict) -> tuple[bool, bool]:
    """Check age filter with strict/expand logic."""
    if not age_filter:
        return (True, True)
    
    min_age = age_filter.get("min", 18)
    max_age = age_filter.get("max", 100)
    exclusive = age_filter.get("exclusive", False)
    expand_if_run_out = age_filter.get("expandIfRunOut", True)
    
    in_range = min_age <= candidate_age <= max_age
    
    if in_range:
        return (True, True)
    
    # Out of range - check strictness
    if exclusive and not expand_if_run_out:
        return (False, False)
    elif exclusive and expand_if_run_out:
        # Allow 5-year buffer for expansion
        expanded_min = max(18, min_age - 5)
        expanded_max = max_age + 5
        in_expanded = expanded_min <= candidate_age <= expanded_max
        return (False, in_expanded)
    else:
        return (True, True)


def apply_hard_filters(
    current_user: Dict,
    candidates: List[Dict],
    filters: Dict,
    user_mode: str = "date"
) -> List[Dict]:
    """
    Apply hard filters to narrow down candidates before AI matching.
    
    Respects user preferences with strict (exclusive) mode:
    - If exclusive=True and expandIfRunOut=False: STRICT - must match exactly
    - If exclusive=True and expandIfRunOut=True: Prefer matches, but expand if needed
    - If exclusive=False: Soft preference, include all
    
    Filters applied:
    - MODE COMPATIBILITY (always strict - buddy only sees buddy, date only sees date)
    - Gender preference (always strict - mutual matching required)
    - Age range (with exclusive/expand options)
    - Languages spoken (with exclusive/expand options)
    - Relationship intent (with exclusive/expand options)
    - Genres (with exclusive/expand options)
    - Film languages (with exclusive/expand options)
    - OTT/Theatre preference (with exclusive/expand options)
    - Lifestyle filters (smoking, drinking, etc.)
    """
    strict_matches = []
    expanded_matches = []
    
    # Extract filter configs with defaults
    age_filter = filters.get("age", {"min": 18, "max": 100, "exclusive": False, "expandIfRunOut": True})
    languages_filter = filters.get("languages", {})
    genres_filter = filters.get("genres", {})
    intent_filter = filters.get("intent", {})
    film_languages_filter = filters.get("filmLanguages", {})
    ott_theatre_filter = filters.get("ottTheatre", {})
    smoking_filter = filters.get("smoking", {})
    drinking_filter = filters.get("drinking", {})
    religion_filter = filters.get("religion", {})
    
    for candidate in candidates:
        # Skip self
        if candidate["user_id"] == current_user.get("user_id"):
            continue
        
        # ========== MODE COMPATIBILITY (Always Strict) ==========
        # Buddy mode users can ONLY see candidates with buddy mode enabled
        # Date mode users can ONLY see candidates with date mode enabled
        if not check_mode_compatibility(user_mode, current_user, candidate):
            continue
        
        # ========== GENDER PREFERENCE (Always Strict - Mutual Match Required) ==========
        user_looking_for = current_user.get("partnerPreference", "Anyone")
        candidate_gender = candidate.get("gender", "")
        
        # Normalize gender values (handle "Man"/"Male", "Woman"/"Female" variations)
        def normalize_gender(g):
            if not g:
                return ""
            g_lower = g.lower()
            if g_lower in ["male", "man"]:
                return "Male"
            elif g_lower in ["female", "woman"]:
                return "Female"
            return g
        
        normalized_candidate_gender = normalize_gender(candidate_gender)
        normalized_user_gender = normalize_gender(current_user.get("gender", ""))
        
        if user_looking_for != "Anyone":
            if user_looking_for == "Men" and normalized_candidate_gender != "Male":
                continue
            if user_looking_for == "Women" and normalized_candidate_gender != "Female":
                continue
        
        # Check if candidate is looking for user's gender
        candidate_looking_for = candidate.get("partnerPreference", "Anyone")
        
        if candidate_looking_for != "Anyone":
            if candidate_looking_for == "Men" and normalized_user_gender != "Male":
                continue
            if candidate_looking_for == "Women" and normalized_user_gender != "Female":
                continue
        
        # Track if this candidate passes all strict filters
        passes_strict = True
        passes_expanded = True
        
        # ========== AGE FILTER ==========
        candidate_age = candidate.get("age", 0)
        strict_age, expanded_age = check_age_filter(candidate_age, age_filter)
        if not expanded_age:
            continue  # Hard reject
        if not strict_age:
            passes_strict = False
        
        # ========== LANGUAGES SPOKEN FILTER ==========
        if languages_filter.get("selected"):
            candidate_languages = candidate.get("languagesSpoken", [])
            strict_lang, expanded_lang = check_filter_match(
                candidate_languages, languages_filter, "selection"
            )
            if not expanded_lang:
                continue
            if not strict_lang:
                passes_strict = False
        
        # ========== RELATIONSHIP INTENT FILTER ==========
        if intent_filter.get("selected"):
            candidate_intents = candidate.get("relationshipIntent", [])
            strict_intent, expanded_intent = check_filter_match(
                candidate_intents, intent_filter, "selection"
            )
            if not expanded_intent:
                continue
            if not strict_intent:
                passes_strict = False
        
        # ========== GENRES FILTER ==========
        if genres_filter.get("selected"):
            candidate_genres = candidate.get("genres", [])
            strict_genre, expanded_genre = check_filter_match(
                candidate_genres, genres_filter, "selection"
            )
            if not expanded_genre:
                continue
            if not strict_genre:
                passes_strict = False
        
        # ========== FILM LANGUAGES FILTER ==========
        if film_languages_filter.get("selected"):
            candidate_film_langs = candidate.get("filmLanguages", [])
            strict_fl, expanded_fl = check_filter_match(
                candidate_film_langs, film_languages_filter, "selection"
            )
            if not expanded_fl:
                continue
            if not strict_fl:
                passes_strict = False
        
        # ========== OTT/THEATRE FILTER ==========
        if ott_theatre_filter.get("selected"):
            candidate_ott = candidate.get("ottTheatre", "")
            strict_ott, expanded_ott = check_filter_match(
                candidate_ott, ott_theatre_filter, "selection"
            )
            if not expanded_ott:
                continue
            if not strict_ott:
                passes_strict = False
        
        # ========== SMOKING FILTER ==========
        if smoking_filter.get("selected"):
            candidate_smoking = candidate.get("smoking", "")
            strict_smoke, expanded_smoke = check_filter_match(
                candidate_smoking, smoking_filter, "selection"
            )
            if not expanded_smoke:
                continue
            if not strict_smoke:
                passes_strict = False
        
        # ========== DRINKING FILTER ==========
        if drinking_filter.get("selected"):
            candidate_drinking = candidate.get("drinking", "")
            strict_drink, expanded_drink = check_filter_match(
                candidate_drinking, drinking_filter, "selection"
            )
            if not expanded_drink:
                continue
            if not strict_drink:
                passes_strict = False
        
        # ========== RELIGION FILTER ==========
        if religion_filter.get("selected"):
            candidate_religion = candidate.get("religion", "")
            strict_rel, expanded_rel = check_filter_match(
                candidate_religion, religion_filter, "selection"
            )
            if not expanded_rel:
                continue
            if not strict_rel:
                passes_strict = False
        
        # Add to appropriate list
        if passes_strict:
            strict_matches.append(candidate)
        elif passes_expanded:
            expanded_matches.append(candidate)
    
    # Return strict matches first, then expanded if needed
    # Only include expanded matches if we don't have enough strict ones
    MIN_MATCHES_BEFORE_EXPAND = 5
    
    if len(strict_matches) >= MIN_MATCHES_BEFORE_EXPAND:
        print(f"Returning {len(strict_matches)} strict matches (no expansion needed)")
        return strict_matches
    else:
        combined = strict_matches + expanded_matches
        print(f"Returning {len(strict_matches)} strict + {len(expanded_matches)} expanded = {len(combined)} total matches")
        return combined


# ============== AI MATCHING SERVICE ==============

async def get_ai_compatibility_scores(
    current_user: Dict,
    candidates: List[Dict],
    top_n: int = 15
) -> List[Dict]:
    """
    Use LLM to analyze profiles and generate compatibility scores with explanations.
    
    The AI model determines its own weights based on profile analysis.
    Returns top N most compatible profiles with descriptive match levels and explanations.
    """
    if not EMERGENT_LLM_KEY:
        print("Warning: EMERGENT_LLM_KEY not set. Using fallback scoring.")
        return fallback_scoring(current_user, candidates, top_n)
    
    if not candidates:
        return []
    
    try:
        # Initialize LLM chat
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"matchmaking_{current_user.get('user_id')}_{datetime.now().timestamp()}",
            system_message="""You are an expert matchmaking AI for a movie-based dating app called Film Companion.
Your job is to analyze user profiles and determine compatibility based on their movie preferences, personality, and lifestyle.

You should consider multiple factors and decide their importance dynamically based on each profile:
- Movie genre preferences and overlap
- Favorite movies similarity
- Liked actors and directors
- Swipe history patterns
- Film language preferences
- Viewing habits (OTT vs Theatre, frequency)
- Lifestyle compatibility
- Relationship intent alignment
- Overall personality match based on movie taste

Provide thoughtful, specific explanations that reference actual movies or preferences shared between users."""
        ).with_model("openai", "gpt-4o")
        
        # Prepare user profile summary
        user_summary = _format_profile_for_ai(current_user)
        
        # Prepare candidates summary
        candidates_summary = "\n\n".join([
            f"CANDIDATE {i+1} (ID: {c['user_id']}):\n{_format_profile_for_ai(c)}"
            for i, c in enumerate(candidates[:20])  # Limit to 20 for token efficiency
        ])
        
        # Create the matching prompt
        prompt = f"""Analyze the compatibility between the following user and the candidates for a movie-based dating match.

CURRENT USER PROFILE:
{user_summary}

CANDIDATE PROFILES:
{candidates_summary}

For each candidate, provide:
1. A compatibility level: "Perfect Match", "Great Match", "Good Match", or "Potential Match"
2. A brief, engaging explanation (2-3 sentences) highlighting specific movie-related connections
3. Key shared interests (2-3 bullet points)

Return your response as a JSON array with this structure:
[
  {{
    "user_id": "candidate_user_id",
    "match_level": "Great Match",
    "explanation": "You both share a deep love for Christopher Nolan's mind-bending films...",
    "shared_interests": ["Sci-Fi thrillers", "Christopher Nolan films", "Mind-bending plots"],
    "compatibility_score": 85
  }}
]

Rank candidates from most to least compatible. Return top {top_n} matches only.
IMPORTANT: Return ONLY the JSON array, no other text."""

        # Send to LLM
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse response
        try:
            # Clean the response - remove markdown code blocks if present
            cleaned_response = response.strip()
            if cleaned_response.startswith("```"):
                cleaned_response = cleaned_response.split("```")[1]
                if cleaned_response.startswith("json"):
                    cleaned_response = cleaned_response[4:]
            cleaned_response = cleaned_response.strip()
            
            matches = json.loads(cleaned_response)
            
            # Enrich with full profile data
            enriched_matches = []
            for match in matches[:top_n]:
                candidate = next(
                    (c for c in candidates if c["user_id"] == match["user_id"]),
                    None
                )
                if candidate:
                    enriched_matches.append({
                        **candidate,
                        "match_level": match.get("match_level", "Good Match"),
                        "explanation": match.get("explanation", "You have compatible movie tastes!"),
                        "shared_interests": match.get("shared_interests", []),
                        "compatibility_score": match.get("compatibility_score", 70)
                    })
            
            return enriched_matches
            
        except json.JSONDecodeError as e:
            print(f"Failed to parse LLM response: {e}")
            print(f"Response was: {response[:500]}")
            return fallback_scoring(current_user, candidates, top_n)
            
    except Exception as e:
        print(f"AI matching error: {e}")
        return fallback_scoring(current_user, candidates, top_n)


def _format_profile_for_ai(profile: Dict) -> str:
    """Format a user profile for AI analysis"""
    top_movies = ", ".join([m.get("title", "") for m in profile.get("topMovies", [])[:3]])
    genres = ", ".join(profile.get("genres", []))
    film_languages = ", ".join(profile.get("filmLanguages", []))
    
    swipe_data = profile.get("swipe_history", {})
    liked_genres = ", ".join(swipe_data.get("liked_genres", []))
    liked_actors = ", ".join(swipe_data.get("liked_actors", []))
    liked_directors = ", ".join(swipe_data.get("liked_directors", []))
    
    return f"""Name: {profile.get('name', 'Unknown')}
Age: {profile.get('age', 'N/A')}
Location: {profile.get('location', 'N/A')}
Bio: {profile.get('bio', '')}
Favorite Genres: {genres}
Top Movies: {top_movies}
Film Languages: {film_languages}
Watch Frequency: {profile.get('movieFrequency', 'N/A')}
Viewing Preference: {profile.get('ottTheatre', 'N/A')}
Liked Genres (from swipes): {liked_genres}
Favorite Actors: {liked_actors}
Favorite Directors: {liked_directors}
Relationship Looking For: {', '.join(profile.get('relationshipIntent', []))}
Lifestyle: Smoking - {profile.get('smoking', 'N/A')}, Drinking - {profile.get('drinking', 'N/A')}, Exercise - {profile.get('exercise', 'N/A')}"""


def fallback_scoring(
    current_user: Dict,
    candidates: List[Dict],
    top_n: int = 15
) -> List[Dict]:
    """
    Fallback scoring when AI is unavailable.
    Uses simple genre and movie overlap calculations.
    """
    scored = []
    
    user_genres = set(current_user.get("genres", []))
    user_swipe_genres = set(current_user.get("swipe_history", {}).get("liked_genres", []))
    user_movies = set(m.get("title", "") for m in current_user.get("topMovies", []))
    
    for candidate in candidates:
        candidate_genres = set(candidate.get("genres", []))
        candidate_swipe_genres = set(candidate.get("swipe_history", {}).get("liked_genres", []))
        candidate_movies = set(m.get("title", "") for m in candidate.get("topMovies", []))
        
        # Calculate overlaps
        genre_overlap = len(user_genres.intersection(candidate_genres))
        swipe_genre_overlap = len(user_swipe_genres.intersection(candidate_swipe_genres))
        movie_overlap = len(user_movies.intersection(candidate_movies))
        
        # Simple score
        score = (genre_overlap * 10) + (swipe_genre_overlap * 15) + (movie_overlap * 25)
        
        # Determine match level
        if score >= 50:
            match_level = "Great Match"
        elif score >= 30:
            match_level = "Good Match"
        else:
            match_level = "Potential Match"
        
        # Generate simple explanation
        shared = []
        if genre_overlap > 0:
            common = list(user_genres.intersection(candidate_genres))[:2]
            shared.extend(common)
        
        explanation = f"You both enjoy {', '.join(shared) if shared else 'similar types of films'}!"
        
        scored.append({
            **candidate,
            "match_level": match_level,
            "explanation": explanation,
            "shared_interests": shared,
            "compatibility_score": min(score, 100)
        })
    
    # Sort by score and return top N
    scored.sort(key=lambda x: x["compatibility_score"], reverse=True)
    return scored[:top_n]


# ============== MAIN MATCHING FUNCTION ==============

async def get_matches_for_user(
    user_id: str,
    user_profile: Optional[Dict] = None,
    filters: Optional[Dict] = None,
    use_mock_data: bool = True,
    force_refresh: bool = False,
    mode: str = "date"
) -> List[Dict]:
    """
    Main function to get matches for a user.
    
    1. Checks cache first (unless force_refresh is True)
    2. If cache miss/expired: Gets user profile, applies filters, runs AI scoring
    3. Caches results before returning
    4. Returns ranked matches
    
    Args:
        user_id: User ID to get matches for
        user_profile: Optional user profile dict
        filters: Optional filter dict with age_min, age_max etc.
        use_mock_data: Whether to use mock users
        force_refresh: If True, bypass cache and regenerate matches
        mode: 'buddy' or 'date' - determines which mode users to match with
    """
    # Get current user profile
    if user_profile is None and use_mock_data:
        # For testing, create a sample user profile
        user_profile = {
            "user_id": user_id,
            "name": "Test User",
            "age": 28,
            "gender": "Male",
            "location": "Mumbai",
            "partnerPreference": "Women",
            "relationshipIntent": ["Long-term relationship"],
            "genres": ["Drama", "Sci-Fi", "Thriller"],
            "filmLanguages": ["Hindi", "English"],
            "languagesSpoken": ["Hindi", "English"],
            "topMovies": [
                {"title": "Inception", "tmdb_id": 27205, "poster_path": "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"},
                {"title": "Interstellar", "tmdb_id": 157336, "poster_path": "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"}
            ],
            "movieFrequency": "Weekly",
            "ottTheatre": "Both",
            "movieBuddyMode": True,
            "movieDateMode": True,
            "swipe_history": {
                "liked_genres": ["Sci-Fi", "Thriller", "Drama"],
                "liked_actors": ["Leonardo DiCaprio", "Christian Bale"],
                "liked_directors": ["Christopher Nolan", "Denis Villeneuve"]
            }
        }
    
    # Include mode in cache key to separate buddy/date caches
    cache_key = f"{user_id}_{mode}"
    
    # Generate profile hash for cache validation
    profile_hash = generate_profile_hash(user_profile) if user_profile else ""
    
    # Step 0: Check cache (unless force refresh requested)
    if not force_refresh:
        cached = await get_cached_matches(cache_key)
        if cached:
            # Verify profile hasn't changed significantly
            cached_hash = cached.get("profile_hash", "")
            if cached_hash == profile_hash or cached_hash == "":
                return cached.get("matches", [])
            else:
                print(f"Profile changed for user {user_id}, regenerating matches")
    
    # Get candidate pool
    if use_mock_data:
        candidates = get_all_mock_users()
    else:
        # TODO: Fetch from database
        candidates = []
    
    # Apply default filters if none provided
    if filters is None:
        filters = {}
    
    # Step 1: Apply hard filters (including mode filtering)
    filtered_candidates = apply_hard_filters(user_profile, candidates, filters, user_mode=mode)
    
    print(f"Filtered {len(candidates)} candidates down to {len(filtered_candidates)} after applying preferences (mode={mode})")
    
    # Step 2: Get AI compatibility scores
    matches = await get_ai_compatibility_scores(user_profile, filtered_candidates, top_n=15)
    
    # Step 3: Save to cache (with mode-specific key)
    await save_matches_to_cache(cache_key, matches, profile_hash)
    
    return matches
