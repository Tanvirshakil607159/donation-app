import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ShieldCheck } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = [
    `${import.meta.env.BASE_URL}slide/1.png`, 
    `${import.meta.env.BASE_URL}slide/2.png`, 
    `${import.meta.env.BASE_URL}slide/3.png`
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000); // Change slide every 5 seconds
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      
      {/* Slideshow Background */}
      {slides.map((slide, index) => (
        <div
          key={slide}
          style={{
            position: 'absolute',
            top: 0, left: 0, width: '100%', height: '100%',
            backgroundImage: `url(${slide})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: currentSlide === index ? 1 : 0, // 100% opacity
            transition: 'opacity 1.5s ease-in-out',
            zIndex: 0
          }}
        />
      ))}

      {/* Overlay gradient for better text visibility (subtle) */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1
      }} />

      {/* Top Right Navigation Buttons */}
      <div className="animate-fade-in" style={{
        position: 'absolute',
        top: '2rem',
        right: '2rem',
        zIndex: 10,
        display: 'flex',
        gap: '1rem',
        animationDelay: '0.4s',
        animationFillMode: 'both'
      }}>
        <button 
          onClick={() => navigate('/donate')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 600,
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(79, 70, 229, 0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.4)'; }}
        >
          <User size={20} />
          Member
        </button>

        <button 
          onClick={() => navigate('/login')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 600,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '50px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            transition: 'transform 0.2s, background-color 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => { 
            e.currentTarget.style.transform = 'translateY(-2px)'; 
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)'; 
          }}
          onMouseLeave={(e) => { 
            e.currentTarget.style.transform = 'translateY(0)'; 
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)'; 
          }}
        >
          <ShieldCheck size={20} />
          Admin
        </button>
      </div>

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: '2rem',
        paddingBottom: '15vh', // Shifts the content slightly upwards
        textAlign: 'center'
      }}>
        
        <h1 className="animate-fade-in" style={{
          fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
          fontWeight: 900,
          marginBottom: '1rem',
          textShadow: '0 4px 24px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)', // Stronger shadow for clarity
          letterSpacing: '-0.02em',
          color: '#ffffff',
          opacity: 1
        }}>
          Welfare Society Uttara Sector 13
        </h1>
        
        <p className="animate-fade-in" style={{
          fontSize: '1.25rem',
          maxWidth: '600px',
          margin: 0,
          opacity: 1,
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          animationDelay: '0.2s',
          animationFillMode: 'both',
          fontWeight: 500
        }}>
          Welcome to our community portal.
        </p>

      </div>
    </div>
  );
}
