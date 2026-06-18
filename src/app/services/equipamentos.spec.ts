import { TestBed } from '@angular/core/testing';

import { Equipamentos } from './equipamentos';

describe('Equipamentos', () => {
  let service: Equipamentos;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Equipamentos);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
