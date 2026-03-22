from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Text, ForeignKey

from app.core.security import SECRET_KEY, ALGORITHM
from app.core.database import Base, get_db, engine

router = APIRouter()
security = HTTPBearer()

class ProblemDB(Base):
    __tablename__ = "problems"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text)
    difficulty = Column(String)

class TestCaseDB(Base):
    __tablename__ = "test_cases"
    id = Column(Integer, primary_key=True, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id"))
    input_data = Column(Text)
    expected_output = Column(Text)

Base.metadata.create_all(bind=engine)

def seed_problems(db: Session):
    if db.query(ProblemDB).count() == 0:
        p1 = ProblemDB(title="İki Sayıyı Toplama", description="Verilen a ve b sayılarını toplayıp geri döndüren fonksiyonu yaz.", difficulty="Kolay")
        db.add(p1)
        db.commit()
        db.add(TestCaseDB(problem_id=p1.id, input_data="3,5", expected_output="8"))
        db.add(TestCaseDB(problem_id=p1.id, input_data="-2,7", expected_output="5"))
        
        p2 = ProblemDB(title="Fibonacci", description="Girilen N sayısına kadar Fibonacci hesapla.", difficulty="Orta")
        db.add(p2)
        db.commit()
        db.add(TestCaseDB(problem_id=p2.id, input_data="5", expected_output="0,1,1,2,3"))
        db.commit()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Geçersiz bilet!")

@router.get("/")
def get_problems(db: Session = Depends(get_db), user_info: dict = Depends(get_current_user)):
    seed_problems(db) 
    return {"status": "success", "data": db.query(ProblemDB).all()}

@router.get("/{problem_id}")
def get_problem_detail(problem_id: int, db: Session = Depends(get_db), user_info: dict = Depends(get_current_user)):
    problem = db.query(ProblemDB).filter(ProblemDB.id == problem_id).first()
    if not problem: raise HTTPException(status_code=404, detail="Soru bulunamadı")
    test_cases = db.query(TestCaseDB).filter(TestCaseDB.problem_id == problem_id).all()
    return {"status": "success", "data": problem, "test_cases_count": len(test_cases)}