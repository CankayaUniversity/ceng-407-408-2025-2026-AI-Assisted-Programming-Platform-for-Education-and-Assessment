from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import requests
import base64

from app.api.problems import get_current_user, ProblemDB, TestCaseDB
from app.core.database import get_db

router = APIRouter()

class ExecuteRequest(BaseModel):
    problem_id: int
    source_code: str
    language_id: int = 71

@router.post("/")
def execute_code(request: ExecuteRequest, db: Session = Depends(get_db), user_info: dict = Depends(get_current_user)):
    test_cases = db.query(TestCaseDB).filter(TestCaseDB.problem_id == request.problem_id).all()
    if not test_cases: raise HTTPException(status_code=400, detail="Test senaryosu bulunamadı.")

    JUDGE0_URL = "http://localhost:2358/submissions?base64_encoded=true&wait=true"
    results = []
    all_passed = True

    for index, test_case in enumerate(test_cases):
        payload = {
            "source_code": base64.b64encode(request.source_code.encode("utf-8")).decode("utf-8"),
            "language_id": request.language_id,
            "stdin": base64.b64encode(test_case.input_data.encode("utf-8")).decode("utf-8"),
            "expected_output": base64.b64encode(test_case.expected_output.encode("utf-8")).decode("utf-8")
        }
        try:
            response = requests.post(JUDGE0_URL, json=payload)
            response.raise_for_status()
            res_json = response.json()
            
            passed = res_json.get("status", {}).get("id") == 3
            if not passed: all_passed = False
            
            results.append({
                "test_case": index + 1,
                "passed": passed,
                "status": res_json.get("status", {}).get("description")
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail="Judge0'a ulaşılamıyor.")
            
    return {"status": "success", "all_passed": all_passed, "results": results}
